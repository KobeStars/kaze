/**
 * Mode responsive : la page de l'onglet affichée en même temps sur plusieurs
 * appareils (mobile, tablette, ordinateur), côte à côte.
 *
 * Chaque appareil est une WebContentsView de la session des onglets, émulée par le protocole
 * DevTools comme dans Chrome (taille d'écran, balise viewport des pages mobiles) et, pour les
 * mobiles, le tactile et l'agent du téléphone. La vue est posée à la taille de l'appareil
 * réduite à l'échelle commune, et la même échelle est donnée à Chromium (paramètre « scale »)
 * pour que l'écran émulé y tienne. Attention : capturePage d'une vue émulée renvoie l'écran
 * entier de l'appareil, pas ce qui est affiché (voir compositeShot dans autotest). L'émulation d'écran
 * d'Electron (enableDeviceEmulation) ne convient pas : elle ignore la balise viewport, et
 * elle fait planter le processus principal si la page n'a pas démarré.
 * La navigation est synchronisée ici ; le défilement, les clics et la saisie par le preload
 * « miroir ».
 * La vue normale de l'onglet est mise de côté le temps du mode responsive.
 */
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { ipcMain, WebContentsView, type Input, type Session, type WebContents } from 'electron'
import { z } from 'zod'
import { deviceSize, findDevice, type DeviceId } from '@shared/responsive'
import type { Settings } from '@shared/settings'
import type { BrowserState, Rect } from '@shared/types'
import { isAllowedTabUrl } from '@shared/url'
import { addRequestHeaderHook, whenIdentityReady } from './chrome-identity'
import type { SettingsService } from './settings'

const major = process.versions.chrome.split('.')[0]!
const IOS_UA = (device: 'iPhone' | 'iPad'): string =>
  `Mozilla/5.0 (${device}; CPU ${device === 'iPhone' ? 'iPhone ' : ''}OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1`
const ANDROID_UA = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`

const mirrorEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scroll'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ type: z.literal('click'), path: z.string().max(4000) }),
  z.object({ type: z.literal('input'), path: z.string().max(4000), value: z.string().max(100_000) })
])

interface DeviceView {
  view: WebContentsView
  device: DeviceId
  rotated: boolean
  /** Échelle d'affichage (emplacement / taille de l'appareil), 0 tant qu'il n'est pas placé. */
  scale: number
}

/** Ce dont le mode responsive a besoin du contrôleur des onglets. */
export interface ResponsiveHost {
  handleInput(input: Input, source: WebContents): boolean
  openTab(url: string): void
  /** La page du premier appareil a changé : l'onglet affiche son adresse, son titre, son icône. */
  pageChanged(info: { url?: string; title?: string; favicon?: string }): void
}

export class ResponsiveService extends EventEmitter<{ changed: [] }> {
  private tabId: number | null = null
  private url = ''
  private devices: DeviceView[] = []
  /**
   * Vues dont la prochaine navigation a été lancée ici (synchronisation, barre d'adresse) :
   * elle ne doit pas repartir vers les autres appareils.
   */
  private readonly expected = new Set<WebContents>()
  private host: ResponsiveHost | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly session: Session
  ) {
    super()
    settings.on('changed', (s) => this.syncDevices(s))
    ipcMain.on('miroir:event', (event, raw: unknown) => {
      const from = this.devices.find((d) => d.view.webContents === event.sender)
      const parsed = mirrorEvent.safeParse(raw)
      if (!from || !parsed.success) return
      for (const d of this.devices) if (d !== from && !d.view.webContents.isDestroyed()) d.view.webContents.send('miroir:apply', parsed.data)
    })
    // Les serveurs voient aussi l'agent du téléphone émulé (pas seulement les scripts).
    addRequestHeaderHook((details, headers) => {
      const d = this.devices.find((x) => x.view.webContents.id === details.webContentsId)
      if (!d) return
      const ua = mobileUserAgent(d.device)
      if (!ua) return
      headers['User-Agent'] = ua
      for (const name of Object.keys(headers)) if (/^sec-ch-ua/i.test(name)) delete headers[name]
      if (findDevice(d.device).os === 'android') {
        headers['Sec-CH-UA-Mobile'] = '?1'
        headers['Sec-CH-UA-Platform'] = '"Android"'
      }
    })
  }

  bind(host: ResponsiveHost): void {
    this.host = host
  }

  get state(): BrowserState['responsive'] {
    return this.tabId === null ? null : { tabId: this.tabId, devices: this.devices.map((d) => ({ id: d.device, rotated: d.rotated })) }
  }

  get activeTabId(): number | null {
    return this.tabId
  }

  get views(): WebContentsView[] {
    return this.devices.map((d) => d.view)
  }

  /** Lance le mode responsive sur un onglet (à l'adresse donnée). */
  start(tabId: number, url: string): void {
    this.stop()
    this.tabId = tabId
    this.url = url
    this.syncDevices(this.settings.get())
    this.emit('changed')
  }

  /** Charge une adresse sur tous les appareils (barre d'adresse). */
  load(url: string): void {
    this.url = url
    for (const d of this.devices) {
      const contents = d.view.webContents
      if (contents.isDestroyed()) continue
      this.expected.add(contents)
      contents.loadURL(url).catch(() => undefined)
    }
  }

  /** Précédent / suivant sur le premier appareil (les autres suivent) ; recharger sur tous. */
  go(action: 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop'): void {
    const all = this.devices.map((d) => d.view.webContents).filter((c) => !c.isDestroyed())
    const first = all[0]
    if (!first) return
    if (action === 'back' && first.navigationHistory.canGoBack()) first.navigationHistory.goBack()
    else if (action === 'forward' && first.navigationHistory.canGoForward()) first.navigationHistory.goForward()
    else if (action === 'reload') all.forEach((c) => c.reload())
    else if (action === 'hard-reload') all.forEach((c) => c.reloadIgnoringCache())
    else if (action === 'stop') all.forEach((c) => c.stop())
  }

  /** Arrête le mode responsive ; renvoie l'adresse où en était l'utilisateur. */
  stop(): string | null {
    if (this.tabId === null) return null
    for (const d of this.devices) this.destroy(d)
    this.devices = []
    this.tabId = null
    this.emit('changed')
    return this.url
  }

  /** Emplacement de chaque appareil, mesuré par l'interface (dans l'ordre des appareils). */
  layout(rects: (Rect | null)[]): Map<WebContentsView, Rect> {
    const placed = new Map<WebContentsView, Rect>()
    this.devices.forEach((d, i) => {
      const rect = rects[i]
      if (!rect || rect.width < 2 || rect.height < 2) return
      placed.set(d.view, rect)
      // L'écran émulé est réduit à la taille de l'emplacement (même calcul que l'interface).
      const scale = Math.max(0.1, Math.round((rect.width / deviceSize(d.device, d.rotated).width) * 1000) / 1000)
      if (Math.abs(scale - d.scale) > 0.002) {
        d.scale = scale
        this.emulate(d)
      }
    })
    return placed
  }

  /** Recrée les vues quand la liste d'appareils change (en gardant l'adresse en cours). */
  private syncDevices(settings: Settings): void {
    if (this.tabId === null) return
    const wanted = settings.responsiveDevices
    const same = wanted.length === this.devices.length && wanted.every((w, i) => w.id === this.devices[i]!.device && w.rotated === this.devices[i]!.rotated)
    if (same) return
    const keep = new Map(this.devices.map((d) => [`${d.device}|${d.rotated}`, d]))
    const next: DeviceView[] = []
    for (const w of wanted) {
      const key = `${w.id}|${w.rotated}`
      const existing = keep.get(key)
      if (existing) {
        keep.delete(key)
        next.push(existing)
      } else next.push(this.create(w.id, w.rotated))
    }
    for (const d of keep.values()) this.destroy(d)
    this.devices = next
    this.emit('changed')
  }

  private create(device: DeviceId, rotated: boolean): DeviceView {
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        preload: join(__dirname, '../preload/miroir.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        safeDialogs: true
      }
    })
    view.setBackgroundColor('#FFFFFF')
    const d: DeviceView = { view, device, rotated, scale: 0 }
    const contents = view.webContents
    // On synchronise l'adresse DEMANDÉE (début de navigation), pas celle d'arrivée : un site
    // qui redirige le mobile vers sa version mobile ne l'impose pas aux autres appareils.
    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      this.started(contents, details.url)
      this.emulate(d)
    })
    // L'émulation envoyée avant que la page existe (ou avant un changement de processus) peut
    // être perdue par Chromium : on la renvoie aussi quand la page est prête.
    contents.on('dom-ready', () => this.emulate(d))
    // L'onglet reflète le premier appareil (adresse, titre, icône), comme s'il naviguait lui-même.
    const first = (): boolean => contents === this.devices[0]?.view.webContents
    contents.on('did-navigate', (_event, url) => {
      if (first()) this.host?.pageChanged({ url })
    })
    contents.on('page-title-updated', (_event, title) => {
      if (first()) this.host?.pageChanged({ title })
    })
    contents.on('page-favicon-updated', (_event, favicons) => {
      const favicon = favicons.find((f) => /^(https?|data):/i.test(f))
      if (first() && favicon) this.host?.pageChanged({ favicon })
    })
    contents.on('will-navigate', (details) => {
      if (!isAllowedTabUrl(details.url) || details.url.startsWith('kaze:')) details.preventDefault()
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedTabUrl(url) && !url.startsWith('kaze:')) this.host?.openTab(url)
      return { action: 'deny' }
    })
    contents.on('before-input-event', (event, input) => {
      if (this.host?.handleInput(input, contents)) event.preventDefault()
    })
    void whenIdentityReady(contents).then(() => {
      // Pas d'attente : avant le premier chargement, Chromium ne répond aux commandes qu'une
      // fois la page créée, mais il les applique dès son premier octet (comme l'identité Chrome).
      this.emulate(d)
      void this.mobileIdentity(d)
      if (this.url && isAllowedTabUrl(this.url) && !this.url.startsWith('kaze:')) {
        this.expected.add(contents)
        contents.loadURL(this.url).catch(() => undefined)
      }
    })
    return d
  }

  private destroy(d: DeviceView): void {
    this.expected.delete(d.view.webContents)
    if (!d.view.webContents.isDestroyed()) d.view.webContents.close()
  }

  private started(source: WebContents, url: string): void {
    if (this.expected.delete(source)) return
    if (!isAllowedTabUrl(url) || url.startsWith('kaze:')) return
    this.url = url
    for (const d of this.devices) {
      const contents = d.view.webContents
      if (contents === source || contents.isDestroyed()) continue
      this.expected.add(contents)
      contents.loadURL(url).catch(() => undefined)
    }
  }

  /**
   * Écran émulé : taille de l'appareil, mode mobile (balise viewport) et échelle d'affichage
   * (sans elle, la page s'affiche en taille réelle et l'emplacement la coupe). La densité est
   * transmise mais Chromium l'ignore dans les vues Electron (devicePixelRatio réel). Sans
   * attente : avant le premier chargement, la commande n'a de réponse qu'une fois la page
   * créée, mais elle est déjà prise en compte.
   */
  private emulate(d: DeviceView): void {
    const contents = d.view.webContents
    if (contents.isDestroyed() || d.scale <= 0) return
    const { width, height } = deviceSize(d.device, d.rotated)
    const device = findDevice(d.device)
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    } catch {
      return // DevTools ouverts sur cette vue
    }
    contents.debugger
      .sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: device.dpr,
        mobile: device.kind !== 'ordinateur',
        scale: d.scale,
        screenWidth: width,
        screenHeight: height,
        screenOrientation: width > height ? { type: 'landscapePrimary', angle: device.kind === 'ordinateur' ? 0 : 90 } : { type: 'portraitPrimary', angle: 0 }
      })
      .catch(() => undefined)
  }

  /** Téléphones et tablettes : agent utilisateur mobile et écran tactile (via le protocole DevTools). */
  private async mobileIdentity(d: DeviceView): Promise<void> {
    const ua = mobileUserAgent(d.device)
    const contents = d.view.webContents
    if (!ua || contents.isDestroyed()) return
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
      const android = findDevice(d.device).os === 'android'
      await Promise.all([
        contents.debugger.sendCommand('Emulation.setUserAgentOverride', {
          userAgent: ua,
          platform: android ? 'Linux armv8l' : d.device.startsWith('ipad') ? 'iPad' : 'iPhone',
          ...(android
            ? {
                userAgentMetadata: {
                  brands: [
                    { brand: 'Google Chrome', version: major },
                    { brand: 'Chromium', version: major },
                    { brand: 'Not:A-Brand', version: '99' }
                  ],
                  platform: 'Android',
                  platformVersion: '14.0.0',
                  architecture: '',
                  model: 'K',
                  mobile: true
                }
              }
            : {})
        }),
        contents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }),
        contents.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' })
      ])
    } catch {
      // DevTools ouverts sur cette vue : on garde l'identité de bureau.
    }
  }
}

function mobileUserAgent(id: DeviceId): string | null {
  const device = findDevice(id)
  if (device.kind === 'ordinateur') return null
  if (device.os === 'android') return ANDROID_UA
  return IOS_UA(device.kind === 'tablette' ? 'iPad' : 'iPhone')
}

/**
 * Bouclier de vent : bloqueur de publicités et de traqueurs.
 *
 * Le moteur de filtrage est celui de Ghostery (@ghostery/adblocker), qui comprend la
 * syntaxe EasyList / EasyPrivacy / uBlock. On charge ses listes « publicités + traqueurs »
 * pré-compilées, mises en cache sur le disque et rafraîchies chaque semaine.
 *
 * Plutôt que de laisser la bibliothèque prendre la main sur la session, Kaze installe ses
 * propres gestionnaires : cela permet de compter les blocages par onglet et de désactiver
 * le Bouclier site par site.
 */
import { EventEmitter } from 'node:events'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain, webContents, type Session } from 'electron'
import { ElectronBlocker, fromElectronDetails } from '@ghostery/adblocker-electron'
import { hostMatches, hostnameOf } from '@shared/url'
import { JsonStore } from '../store'
import type { SettingsService } from './settings'

const ENGINE_MAX_AGE = 7 * 24 * 3_600_000

interface ShieldStats {
  totalBlocked: number
}

export class ShieldService extends EventEmitter<{ blocked: [webContentsId: number]; ready: [] }> {
  private blocker: ElectronBlocker | null = null
  private readonly stats = new JsonStore<ShieldStats>('bouclier', (raw) => ({
    totalBlocked: typeof (raw as ShieldStats | undefined)?.totalBlocked === 'number' ? (raw as ShieldStats).totalBlocked : 0
  }))

  constructor(private readonly settings: SettingsService) {
    super()
  }

  get ready(): boolean {
    return this.blocker !== null
  }

  get totalBlocked(): number {
    return this.stats.get().totalBlocked
  }

  get enabled(): boolean {
    return this.settings.get().shield.enabled
  }

  /** Le Bouclier est-il désactivé pour la page affichée à cette adresse ? */
  isSiteAllowed(pageUrl: string): boolean {
    const host = hostnameOf(pageUrl)
    if (!host) return false
    return this.settings.get().shield.allowlist.some((domain) => hostMatches(host, domain))
  }

  /** Active ou désactive le Bouclier pour le site de cette page. */
  toggleSite(pageUrl: string): void {
    const host = hostnameOf(pageUrl)
    if (!host) return
    const shield = this.settings.get().shield
    const allowlist = this.isSiteAllowed(pageUrl)
      ? shield.allowlist.filter((domain) => !hostMatches(host, domain))
      : [...shield.allowlist, host]
    this.settings.set({ shield: { ...shield, allowlist } })
  }

  /** Charge le moteur (depuis le cache ou le réseau) puis l'attache à la session des onglets. */
  async attach(session: Session): Promise<void> {
    this.installHandlers(session)
    const cachePath = join(app.getPath('userData'), 'bouclier-moteur.bin')
    try {
      const info = await stat(cachePath).catch(() => null)
      if (info && Date.now() - info.mtimeMs > ENGINE_MAX_AGE) await unlink(cachePath).catch(() => undefined)
      this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
        path: cachePath,
        read: (path: string) => readFile(path),
        write: (path: string, data: Uint8Array) => writeFile(path, data)
      })
      this.installCosmetics(session)
      this.emit('ready')
    } catch (error) {
      console.warn('[bouclier] listes de filtres indisponibles (hors ligne ?), nouvel essai dans 10 min', error)
      setTimeout(() => void this.attach(session), 10 * 60_000)
    }
  }

  /** Vrai si les requêtes de ce webContents doivent passer sans filtrage. */
  private bypass(webContentsId: number | undefined): boolean {
    if (!this.blocker || !this.enabled) return true
    if (webContentsId === undefined) return false
    const contents = webContents.fromId(webContentsId)
    return contents ? this.isSiteAllowed(contents.getURL()) : false
  }

  private installHandlers(session: Session): void {
    // Electron n'accepte qu'un seul écouteur par évènement : on le pose une seule fois.
    if ((session as Session & { __kazeShield?: boolean }).__kazeShield) return
    ;(session as Session & { __kazeShield?: boolean }).__kazeShield = true

    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.resourceType === 'mainFrame' || this.bypass(details.webContentsId)) {
        callback({})
        return
      }
      const request = fromElectronDetails(details)
      if (request.type === 'other') request.guessTypeOfRequest()
      const { redirect, match } = this.blocker!.match(request)
      if (redirect) {
        this.count(details.webContentsId)
        callback({ redirectURL: redirect.dataUrl })
      } else if (match) {
        this.count(details.webContentsId)
        callback({ cancel: true })
      } else {
        callback({})
      }
    })

    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      if (this.bypass(details.webContentsId)) {
        callback({})
        return
      }
      this.blocker!.onHeadersReceived(details, callback)
    })
  }

  /**
   * Filtres cosmétiques : masquent les emplacements vides laissés par les publicités.
   * Un petit script fourni par Ghostery est injecté dans chaque cadre des onglets.
   */
  private installCosmetics(session: Session): void {
    const preload = require.resolve('@ghostery/adblocker-electron-preload')
    session.registerPreloadScript({ type: 'frame', filePath: preload })
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url: unknown, msg: unknown) => {
      if (typeof url !== 'string' || this.bypass(event.sender.id)) return undefined
      return this.blocker!.onInjectCosmeticFilters(event, url, msg as never)
    })
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) => this.blocker!.onIsMutationObserverEnabled(event))
  }

  private count(webContentsId: number | undefined): void {
    this.stats.update((s) => {
      s.totalBlocked += 1
    })
    if (webContentsId !== undefined) this.emit('blocked', webContentsId)
  }
}

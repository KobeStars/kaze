/**
 * Extensions Chrome : installation depuis le Chrome Web Store (ou un dossier), chargement
 * dans la session des onglets, boutons et fenêtres « popup ».
 *
 * Electron sait faire tourner une extension (scripts dans les pages, page d'arrière-plan,
 * stockage…) mais ne sait ni l'installer depuis le Store ni afficher son bouton : c'est fait
 * ici. Le paquet .crx est téléchargé sur le serveur officiel de Google, son en-tête est
 * retiré, puis l'archive est décompressée dans %APPDATA%\Kaze\extensions\<identifiant>.
 *
 * Electron n'implémente qu'une partie des API Chrome : les extensions qui agissent dans les
 * pages (thèmes sombres, outils de développement, traducteurs…) marchent le mieux.
 */
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, net, type Rectangle, type Session } from 'electron'
import { unzipSync } from 'fflate'
import type { ExtensionEntry } from '@shared/types'
import { JsonStore } from '../store'

/** Un onglet au format chrome.tabs.Tab (l'essentiel). */
export interface ExtensionTab {
  id: number
  index: number
  windowId: number
  active: boolean
  highlighted: boolean
  selected: boolean
  pinned: boolean
  incognito: boolean
  discarded: boolean
  autoDiscardable: boolean
  groupId: number
  audible: boolean
  mutedInfo: { muted: boolean }
  status: 'loading' | 'complete'
  url: string
  title: string
  favIconUrl?: string
}

interface StoredExtension {
  /** Identifiant du Chrome Web Store (null pour un dossier ajouté à la main). */
  storeId: string | null
  path: string
  enabled: boolean
}

/** Identifiant du Chrome Web Store : 32 lettres de a à p. */
const STORE_ID = /\b([a-p]{32})\b/
const MAX_CRX = 150 * 1024 * 1024

export class ExtensionsService extends EventEmitter<{ changed: [ExtensionEntry[]] }> {
  private readonly store = new JsonStore<{ items: StoredExtension[] }>('extensions', (raw) => {
    const items = (raw as { items?: unknown } | undefined)?.items
    return {
      items: Array.isArray(items)
        ? items.filter((i): i is StoredExtension => typeof i?.path === 'string' && typeof i?.enabled === 'boolean').map((i) => ({ storeId: typeof i.storeId === 'string' ? i.storeId : null, path: i.path, enabled: i.enabled }))
        : []
    }
  })
  /** Identifiant donné par Electron à chaque extension chargée, par dossier. */
  private readonly loaded = new Map<string, string>()
  private readonly errors = new Map<string, string>()
  private popup: BrowserWindow | null = null
  /** Onglets de Kaze vus par les extensions (fourni par le contrôleur des onglets). */
  private tabs: () => ExtensionTab[] = () => []

  constructor(private readonly session: Session) {
    super()
    // Couche de compatibilité (src/preload/extensions.ts) dans le moteur d'arrière-plan des
    // extensions et dans leurs pages ; elle ne fait rien hors de chrome-extension://.
    const filePath = join(__dirname, '../preload/extensions.js')
    session.registerPreloadScript({ type: 'service-worker', id: 'kaze-extensions-sw', filePath })
    session.registerPreloadScript({ type: 'frame', id: 'kaze-extensions-pages', filePath, includeGlobs: ['chrome-extension://*'] })

    // chrome.tabs.query / get de la couche de compatibilité : pages d'extension…
    ipcMain.handle('kaze-ext:tabs', (event) => {
      if (!event.senderFrame?.url.startsWith('chrome-extension://')) throw new Error('Réservé aux extensions')
      return this.tabs()
    })
    // … et moteurs d'arrière-plan (service workers), chacun avec son propre canal IPC.
    const wired = new Set<number>()
    session.serviceWorkers.on('running-status-changed', ({ versionId }) => {
      const worker = session.serviceWorkers.getWorkerFromVersionID(versionId)
      if (!worker || wired.has(versionId) || !worker.scope.startsWith('chrome-extension://')) return
      wired.add(versionId)
      worker.ipc.handle('kaze-ext:tabs', () => this.tabs())
    })
  }

  setTabsProvider(provider: () => ExtensionTab[]): void {
    this.tabs = provider
  }

  private get dir(): string {
    return join(app.getPath('userData'), 'extensions')
  }

  /** Charge les extensions activées (au démarrage, avant les onglets : leurs scripts s'appliquent dès la première page). */
  async init(): Promise<void> {
    await Promise.allSettled(this.store.get().items.filter((i) => i.enabled).map((i) => this.load(i.path)))
  }

  async list(): Promise<ExtensionEntry[]> {
    return Promise.all(this.store.get().items.map((item) => this.describe(item)))
  }

  /** Installe (ou met à jour) une extension du Chrome Web Store, d'après son lien ou son identifiant. */
  async installFromStore(input: string): Promise<ExtensionEntry> {
    const storeId = STORE_ID.exec(input)?.[1]
    if (!storeId) throw new Error('Lien ou identifiant du Chrome Web Store non reconnu.')
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${process.versions.chrome}&acceptformat=crx2,crx3&x=id%3D${storeId}%26installsource%3Dondemand%26uc`
    const response = await net.fetch(url)
    if (!response.ok || response.status === 204) throw new Error(`Extension introuvable sur le Chrome Web Store (${response.status}).`)
    const crx = new Uint8Array(await response.arrayBuffer())
    if (crx.byteLength > MAX_CRX) throw new Error('Extension trop volumineuse.')
    const files = unzipSync(crxToZip(crx))

    const target = join(this.dir, storeId)
    const previous = this.store.get().items.find((i) => i.path === target)
    if (this.loaded.has(target)) this.unload(target)
    await rm(target, { recursive: true, force: true })
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/')) continue
      // Chrome réserve les noms qui commencent par « _ » à la racine (sauf _locales) : _metadata est refusé au chargement.
      if (/^_(?!locales\/)/.test(name)) continue
      const path = normalize(join(target, name))
      if (!path.startsWith(target + sep)) throw new Error('Archive d’extension invalide.')
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    }
    if (!existsSync(join(target, 'manifest.json'))) throw new Error('Archive d’extension invalide (pas de manifest.json).')

    const item: StoredExtension = { storeId, path: target, enabled: previous?.enabled ?? true }
    this.save([...this.store.get().items.filter((i) => i.path !== target), item])
    if (item.enabled) await this.load(target)
    await this.changed()
    return this.describe(item)
  }

  /** Ajoute une extension décompressée depuis un dossier (mode développeur). */
  async installFromFolder(parent: BrowserWindow): Promise<ExtensionEntry | null> {
    const result = await dialog.showOpenDialog(parent, { title: 'Dossier de l’extension (avec manifest.json)', properties: ['openDirectory'] })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    if (!existsSync(join(path, 'manifest.json'))) throw new Error('Ce dossier ne contient pas de manifest.json.')
    const item: StoredExtension = { storeId: null, path, enabled: true }
    if (this.loaded.has(path)) this.unload(path)
    this.save([...this.store.get().items.filter((i) => i.path !== path), item])
    await this.load(path)
    await this.changed()
    return this.describe(item)
  }

  async remove(path: string): Promise<void> {
    const item = this.find(path)
    this.unload(path)
    this.save(this.store.get().items.filter((i) => i.path !== path))
    // Seules les extensions téléchargées par Kaze sont effacées du disque (jamais le dossier d'un développeur).
    if (item.storeId && path.startsWith(this.dir + sep)) await rm(path, { recursive: true, force: true })
    await this.changed()
  }

  async toggle(path: string, enabled: boolean): Promise<void> {
    const item = this.find(path)
    this.save(this.store.get().items.map((i) => (i.path === path ? { ...i, enabled } : i)))
    if (enabled) await this.load(item.path)
    else this.unload(item.path)
    await this.changed()
  }

  /** Ouvre la fenêtre « popup » d'une extension sous son bouton (rect : position dans la fenêtre). */
  async openPopup(path: string, parent: BrowserWindow, rect: Rectangle): Promise<void> {
    const id = this.loaded.get(path)
    const manifest = await readManifest(path)
    const page = manifest.action?.default_popup ?? manifest.browser_action?.default_popup
    if (!id || typeof page !== 'string') return
    this.popup?.close()
    const bounds = parent.getContentBounds()
    const popup = new BrowserWindow({
      parent,
      width: 360,
      height: 480,
      x: Math.round(bounds.x + rect.x + rect.width - 360),
      y: Math.round(bounds.y + rect.y + rect.height + 4),
      frame: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: { session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    this.popup = popup
    popup.on('blur', () => popup.close())
    popup.on('closed', () => {
      if (this.popup === popup) this.popup = null
    })
    popup.webContents.on('did-finish-load', () => {
      // La fenêtre prend la taille du contenu de l'extension (bornée), alignée à droite sous le bouton.
      void popup.webContents
        .executeJavaScript('({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) })', true)
        .then(({ w, h }: { w: number; h: number }) => {
          if (popup.isDestroyed()) return
          const width = Math.min(800, Math.max(160, w))
          const height = Math.min(600, Math.max(60, h))
          popup.setBounds({ x: Math.round(bounds.x + rect.x + rect.width - width), y: Math.round(bounds.y + rect.y + rect.height + 4), width, height })
          popup.show()
        })
        .catch(() => popup.show())
    })
    await popup.loadURL(`chrome-extension://${id}/${page.replace(/^\//, '')}`).catch(() => popup.show())
  }

  private find(path: string): StoredExtension {
    const item = this.store.get().items.find((i) => i.path === path)
    if (!item) throw new Error('Extension inconnue.')
    return item
  }

  private save(items: StoredExtension[]): void {
    this.store.set({ items })
  }

  private async load(path: string): Promise<void> {
    try {
      const extension = await this.session.extensions.loadExtension(path, { allowFileAccess: true })
      this.loaded.set(path, extension.id)
      this.errors.delete(path)
    } catch (error) {
      this.errors.set(path, error instanceof Error ? error.message : String(error))
    }
  }

  private unload(path: string): void {
    const id = this.loaded.get(path)
    if (id) this.session.extensions.removeExtension(id)
    this.loaded.delete(path)
  }

  private async changed(): Promise<void> {
    this.emit('changed', await this.list())
  }

  private async describe(item: StoredExtension): Promise<ExtensionEntry> {
    const base = { path: item.path, storeId: item.storeId, enabled: item.enabled, loaded: this.loaded.has(item.path), error: this.errors.get(item.path) ?? null }
    try {
      const manifest = await readManifest(item.path)
      const action = manifest.action ?? manifest.browser_action
      return {
        ...base,
        name: await translate(item.path, manifest, manifest.name) || 'Extension',
        description: (await translate(item.path, manifest, manifest.description ?? '')).slice(0, 300),
        version: String(manifest.version ?? ''),
        icon: await iconData(item.path, action?.default_icon ?? manifest.icons),
        hasPopup: typeof action?.default_popup === 'string'
      }
    } catch {
      return { ...base, name: 'Extension illisible', description: '', version: '', icon: null, hasPopup: false, error: base.error ?? 'manifest.json illisible' }
    }
  }
}

/** Retire l'en-tête d'un paquet .crx (versions 2 et 3) pour obtenir l'archive zip. */
function crxToZip(crx: Uint8Array): Uint8Array {
  const view = new DataView(crx.buffer, crx.byteOffset, crx.byteLength)
  const magic = String.fromCharCode(...crx.subarray(0, 4))
  if (magic === 'PK\u0003\u0004') return crx
  if (magic !== 'Cr24') throw new Error('Paquet .crx invalide.')
  const version = view.getUint32(4, true)
  const start = version === 3 ? 12 + view.getUint32(8, true) : 16 + view.getUint32(8, true) + view.getUint32(12, true)
  return crx.subarray(start)
}

interface Manifest {
  name: string
  description?: string
  version?: string
  default_locale?: string
  icons?: Record<string, string>
  action?: { default_popup?: string; default_icon?: string | Record<string, string> }
  browser_action?: { default_popup?: string; default_icon?: string | Record<string, string> }
}

async function readManifest(path: string): Promise<Manifest> {
  return JSON.parse((await readFile(join(path, 'manifest.json'), 'utf8')).replace(/^﻿/, '')) as Manifest
}

/** Traduit les textes « __MSG_nom__ » du manifeste (français, sinon la langue par défaut de l'extension). */
async function translate(path: string, manifest: Manifest, text: string): Promise<string> {
  const key = /^__MSG_(.+)__$/.exec(text)?.[1]
  if (!key) return text
  for (const locale of ['fr', manifest.default_locale, 'en'].filter(Boolean)) {
    try {
      const messages = JSON.parse((await readFile(join(path, '_locales', locale!, 'messages.json'), 'utf8')).replace(/^﻿/, '')) as Record<string, { message?: string }>
      const found = Object.entries(messages).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]?.message
      if (found) return found
    } catch {
      // langue absente : on essaie la suivante
    }
  }
  return text
}

/** Icône de l'extension en adresse data: (la plus proche de 32 px). */
async function iconData(path: string, icon: string | Record<string, string> | undefined): Promise<string | null> {
  if (!icon) return null
  const file =
    typeof icon === 'string'
      ? icon
      : Object.entries(icon).sort(([a], [b]) => Math.abs(Number(a) - 32) - Math.abs(Number(b) - 32))[0]?.[1]
  if (!file) return null
  try {
    const data = await readFile(join(path, file.replace(/^\//, '')))
    const type = file.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png'
    return `data:${type};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

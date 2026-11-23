/**
 * Contrôleur du navigateur : la source de vérité de Kaze.
 *
 * Il possède les onglets, les Courants (espaces de travail), le split view, le panneau
 * latéral, Brise (mise en veille) et les raccourcis. L'interface React ne fait qu'afficher
 * l'état qu'il diffuse (`browser:state`) et lui envoyer des commandes.
 *
 * Disposition : l'interface mesure les zones où doivent apparaître les pages (`viewport`)
 * et les envoie ; le contrôleur y place les WebContentsView. Quand une fenêtre flottante
 * de l'interface (Souffle, paramètres…) doit passer par-dessus, les pages sont « figées » :
 * on en prend une capture que l'interface affiche, et les vraies vues sont retirées.
 */
import { join } from 'node:path'
import { BrowserWindow, WebContentsView, type ContextMenuParams, type Input, type Session, type WebContents } from 'electron'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import { isShortcutAction, normalizeKeyPress, type ShortcutAction } from '@shared/shortcuts'
import type {
  BrowserState,
  FindResult,
  FrozenView,
  HomeData,
  PanelApp,
  Rect,
  SplitSide,
  SplitState,
  UiCommand,
  Workspace
} from '@shared/types'
import { HOME_URL, SEARCH_ENGINES, STUDIO_URL, WELCOME_URL, isAllowedTabUrl, isHomeUrl, isStudioUrl, resolveInput } from '@shared/url'
import { emit } from '../ipc/router'
import { JsonStore, newId } from '../store'
import type { BookmarksService } from '../services/bookmarks'
import type { DownloadsService } from '../services/downloads'
import type { HistoryService } from '../services/history'
import type { HomeService } from '../services/home'
import { applySiteRules } from '../services/site-rules'
import { whenIdentityReady } from '../services/chrome-identity'
import type { StudioService } from '../studio/service'
import type { SettingsService } from '../services/settings'
import type { ShieldService } from '../services/shield'
import type { StormService } from '../services/storm'
import type { ResponsiveService } from '../services/responsive'
import type { ExtensionTab } from '../services/extensions'
import type { VpnService } from '../services/vpn'
import { pageContextMenu, tabContextMenu } from './menus'
import { Tab, type TabHost } from './tab'

export interface Services {
  settings: SettingsService
  history: HistoryService
  bookmarks: BookmarksService
  downloads: DownloadsService
  shield: ShieldService
  storm: StormService
  vpn: VpnService
  responsive: ResponsiveService
  home: HomeService
  studio: StudioService
}

/** Adresse de base des fichiers perso, servie par le protocole kaze://. */
export const PERSO_BASE = 'kaze://app/__perso/'

/**
 * Raccourcis laissés à Kaze Studio quand il a le focus : ce sont ceux de l'éditeur
 * (fermer le fichier, rechercher / remplacer, sélection multiple, commentaires…).
 */
const STUDIO_KEYS = new Set(['Ctrl+W', 'Ctrl+F', 'Ctrl+H', 'Ctrl+D', 'Ctrl+K', 'Ctrl+L', 'Ctrl+Shift+K', 'Ctrl+B'])

interface Viewport {
  primary: Rect | null
  secondary: Rect | null
  panel: Rect | null
  /** Emplacements des appareils du mode responsive. */
  responsive: (Rect | null)[]
}

interface SavedTab {
  workspaceId: string
  url: string
  title: string
  favicon: string | null
  active: boolean
}

interface SessionData {
  workspaces: Workspace[]
  activeWorkspaceId: string
  tabs: SavedTab[]
  panelApps: PanelApp[]
}

interface ClosedTab {
  url: string
  title: string
  favicon: string | null
  workspaceId: string
}

export const DEFAULT_WORKSPACE: Workspace = { id: 'principal', name: 'Principal', color: '#D7372A', icon: '風' }

const DEFAULT_PANEL_APPS: PanelApp[] = [
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app', favicon: null },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', favicon: null },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', favicon: null }
]

function repairSession(raw: unknown): SessionData {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SessionData>
  const workspaces = Array.isArray(data.workspaces) && data.workspaces.length > 0 ? data.workspaces : [DEFAULT_WORKSPACE]
  const activeWorkspaceId = workspaces.some((w) => w.id === data.activeWorkspaceId) ? data.activeWorkspaceId! : workspaces[0]!.id
  return {
    workspaces,
    activeWorkspaceId,
    tabs: Array.isArray(data.tabs) ? data.tabs.filter((t) => typeof t?.url === 'string' && isAllowedTabUrl(t.url)) : [],
    panelApps: Array.isArray(data.panelApps) ? data.panelApps : DEFAULT_PANEL_APPS
  }
}

export class BrowserController implements TabHost {
  readonly preloadPath = join(__dirname, '../preload/interne.js')

  private readonly tabs = new Map<number, Tab>()
  private order: number[] = []
  private nextId = 1
  private workspaces: Workspace[]
  private activeWorkspaceId: string
  private readonly activeByWorkspace = new Map<string, number>()
  private split: SplitState | null = null
  private panelApps: PanelApp[]
  private panelOpenId: string | null = null
  private readonly panelViews = new Map<string, WebContentsView>()
  private viewport: Viewport = { primary: null, secondary: null, panel: null, responsive: [] }
  private frozen = false
  private freezeToken = 0
  private readonly attached = new Set<WebContentsView>()
  private fullscreenTabId: number | null = null
  private fullscreenEnteredByPage = false
  private closed: ClosedTab[] = []
  private shortcutsSuspended = false
  private shortcutMap = new Map<string, ShortcutAction>()
  private flushTimer: NodeJS.Timeout | null = null
  private readonly sessionStore = new JsonStore<SessionData>('session', repairSession)

  constructor(
    private readonly win: BrowserWindow,
    readonly session: Session,
    private readonly services: Services
  ) {
    const saved = this.sessionStore.get()
    this.workspaces = saved.workspaces
    this.activeWorkspaceId = saved.activeWorkspaceId
    this.panelApps = saved.panelApps
    this.rebuildShortcutMap(services.settings.get())

    // Restauration de la session : les onglets reviennent endormis (rien n'est chargé
    // tant qu'on ne les ouvre pas), sauf l'onglet actif.
    if (services.settings.get().startup === 'restaurer') {
      for (const t of saved.tabs) {
        if (!this.workspaces.some((w) => w.id === t.workspaceId)) continue
        const id = this.createTab({ url: t.url, workspaceId: t.workspaceId, activate: false, sleep: true, title: t.title, favicon: t.favicon })
        if (t.active) this.activeByWorkspace.set(t.workspaceId, id)
      }
    }
    this.activateWorkspace(this.activeWorkspaceId)
    // Premier lancement : la page de bienvenue s'ouvre une seule fois.
    if (!services.settings.get().welcomeSeen) {
      this.createTab({ url: WELCOME_URL })
      services.settings.set({ welcomeSeen: true })
    }
    if (services.settings.get().startup === 'accueil') {
      const home = this.homeUrl()
      if (home !== HOME_URL) this.currentTab()?.load(home)
    }

    this.bindServices()
    services.responsive.bind({
      handleInput: (input, source) => this.handleInput(input, source),
      openTab: (url) => void this.createTab({ url }),
      pageChanged: ({ url, title, favicon }) => {
        const tab = this.tabs.get(services.responsive.activeTabId ?? -1)
        if (!tab) return
        if (url !== undefined) tab.state.url = url
        if (title !== undefined) tab.state.title = title
        if (favicon !== undefined) tab.state.favicon = favicon
        this.updateWindowTitle()
        this.schedule()
      }
    })
    this.win.on('resize', () => this.applyLayout())
    this.win.webContents.on('before-input-event', (event, input) => {
      if (this.handleInput(input, this.win.webContents)) event.preventDefault()
    })
    // Brise : vérification chaque minute des onglets inactifs.
    setInterval(() => this.breezeTick(), 60_000)
  }

  // ───────────────────────── Services ─────────────────────────

  private bindServices(): void {
    const { settings, bookmarks, history, downloads, shield, storm, home, studio } = this.services
    settings.on('changed', (s) => {
      this.rebuildShortcutMap(s)
      emit(this.ui, 'settings:changed', s)
      this.pushHomeData()
      studio.pushState()
      this.schedule()
    })
    // Changement de thème automatique (heure, Windows).
    settings.on('theme', () => {
      this.pushHomeData()
      studio.pushState()
      this.schedule()
    })
    home.on('changed', () => this.pushHomeData())
    studio.on('event', (event) => {
      for (const tab of this.tabs.values()) if (isStudioUrl(tab.state.url)) emit(tab.contents, 'studio:event', event)
    })
    bookmarks.on('changed', (list) => {
      for (const tab of this.tabs.values()) tab.state.bookmarked = bookmarks.has(tab.state.url)
      emit(this.ui, 'bookmarks:changed', list)
      this.pushHomeData()
      this.schedule()
    })
    history.on('changed', () => emit(this.ui, 'history:changed', null))
    downloads.on('changed', (list) => emit(this.ui, 'downloads:changed', list))
    downloads.on('started', () => this.uiCommand('open-downloads'))
    // Son de notification (sans voler le focus de la page).
    downloads.on('completed', () => emit(this.ui, 'ui:command', 'play-sound-notif'))
    shield.on('blocked', (contentsId) => {
      const tab = this.tabByContentsId(contentsId)
      if (tab) tab.state.blockedCount += 1
      this.schedule(120)
    })
    shield.on('ready', () => this.schedule())
    storm.on('changed', () => this.applyStorm())
    this.services.vpn.on('changed', () => this.schedule())
    this.services.responsive.on('changed', () => {
      this.applyLayout()
      this.schedule()
    })
  }

  private get ui(): WebContents {
    return this.win.webContents
  }

  settingsSnapshot(): Settings {
    return this.services.settings.get()
  }

  // ───────────────────────── Implémentation de TabHost ─────────────────────────

  internalBackground(): string {
    return this.services.settings.activeTheme().colors.bg
  }

  changed(): void {
    this.schedule()
  }

  openTab(url: string, options: { background: boolean; opener: Tab }): void {
    this.createTab({ url, workspaceId: options.opener.state.workspaceId, afterId: options.opener.id, activate: !options.background })
  }

  visited(tab: Tab, kind: 'navigate' | 'title' | 'favicon'): void {
    const { url, title, favicon } = tab.state
    const { history, bookmarks } = this.services
    if (kind === 'navigate') history.record(url, title, favicon)
    else if (kind === 'title') history.updateTitle(url, title)
    else if (favicon) {
      history.updateFavicon(url, favicon)
      bookmarks.updateFavicon(url, favicon)
    }
    if (tab.id === this.currentTab()?.id) this.updateWindowTitle()
  }

  isBookmarked(url: string): boolean {
    return this.services.bookmarks.has(url)
  }

  stormBlockedHost(url: string): string | null {
    return this.services.storm.blockedHost(url)
  }

  showContextMenu(tab: Tab, params: ContextMenuParams): void {
    pageContextMenu(this, tab, params).popup({ window: this.win })
  }

  findResult(result: FindResult): void {
    emit(this.ui, 'find:result', result)
  }

  fullscreen(tab: Tab, enabled: boolean): void {
    if (enabled) {
      this.fullscreenTabId = tab.id
      if (!this.win.isFullScreen()) {
        this.fullscreenEnteredByPage = true
        this.win.setFullScreen(true)
      }
    } else {
      this.fullscreenTabId = null
      if (this.fullscreenEnteredByPage) this.win.setFullScreen(false)
      this.fullscreenEnteredByPage = false
    }
    this.applyLayout()
    this.schedule()
  }

  pageReady(tab: Tab): void {
    const contents = tab.contents
    const rules = this.services.settings.get().appearance.siteRules
    if (contents && rules.length > 0) applySiteRules(contents, rules)
  }

  focused(tab: Tab): void {
    if (!this.split) return
    const side: SplitSide | null =
      this.split.primaryId === tab.id ? 'primary' : this.split.secondaryId === tab.id ? 'secondary' : null
    if (side && side !== this.split.focused) {
      this.split.focused = side
      this.activeByWorkspace.set(this.activeWorkspaceId, tab.id)
      this.schedule()
    }
  }

  // ───────────────────────── Onglets ─────────────────────────

  get(tabId: number): Tab | undefined {
    return this.tabs.get(tabId)
  }

  tabByContentsId(contentsId: number): Tab | undefined {
    for (const tab of this.tabs.values()) if (tab.contents?.id === contentsId) return tab
    return undefined
  }

  allTabs(): Tab[] {
    return this.order.map((id) => this.tabs.get(id)!).filter(Boolean)
  }

  private tabsOf(workspaceId: string): Tab[] {
    return this.allTabs().filter((t) => t.state.workspaceId === workspaceId)
  }

  activeTab(): Tab | undefined {
    const id = this.activeByWorkspace.get(this.activeWorkspaceId)
    return id !== undefined ? this.tabs.get(id) : undefined
  }

  /** L'onglet visé par les commandes (côté focalisé en split view). */
  currentTab(): Tab | undefined {
    if (this.split) return this.tabs.get(this.split.focused === 'primary' ? this.split.primaryId : this.split.secondaryId)
    return this.activeTab()
  }

  homeUrl(): string {
    const { homepage, searchEngine } = this.services.settings.get()
    if (homepage.mode === 'url' && homepage.url.trim()) {
      const url = resolveInput(homepage.url, searchEngine)
      if (isAllowedTabUrl(url)) return url
    }
    return HOME_URL
  }

  createTab(options: {
    url?: string
    workspaceId?: string
    activate?: boolean
    afterId?: number
    sleep?: boolean
    title?: string
    favicon?: string | null
  }): number {
    const id = this.nextId++
    const workspaceId = options.workspaceId ?? this.activeWorkspaceId
    const url = options.url && isAllowedTabUrl(options.url) ? options.url : HOME_URL
    const tab = new Tab(this, { id, workspaceId, url, title: options.title, favicon: options.favicon })
    this.tabs.set(id, tab)
    const afterIndex = options.afterId !== undefined ? this.order.indexOf(options.afterId) : -1
    if (afterIndex >= 0) {
      // Comme Chrome : les onglets ouverts depuis une page se rangent à sa droite,
      // après ceux qu'elle a déjà ouverts.
      let index = afterIndex + 1
      while (index < this.order.length && this.openedFrom.get(this.order[index]!) === options.afterId) index++
      this.order.splice(index, 0, id)
      this.openedFrom.set(id, options.afterId!)
    } else {
      this.order.push(id)
    }
    if (!options.sleep) tab.wake()
    if (options.activate !== false) this.activate(id)
    this.schedule()
    return id
  }

  /** Mémorise de quel onglet chaque onglet a été ouvert (pour le rangement). */
  private readonly openedFrom = new Map<number, number>()

  activate(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if (tab.state.workspaceId !== this.activeWorkspaceId) {
      this.split = null
      this.activeWorkspaceId = tab.state.workspaceId
    }
    if (this.split && tabId !== this.split.primaryId && tabId !== this.split.secondaryId) this.split = null
    if (this.split) this.split.focused = tabId === this.split.primaryId ? 'primary' : 'secondary'
    this.activeByWorkspace.set(this.activeWorkspaceId, tabId)
    tab.wake()
    tab.lastSeen = Date.now()
    this.applyLayout()
    if (!this.frozen) tab.contents?.focus()
    this.updateWindowTitle()
    this.schedule()
  }

  closeTab(tabId: number, options: { keepWorkspaceAlive?: boolean } = {}): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if (this.services.responsive.activeTabId === tabId) this.services.responsive.stop()
    const workspaceId = tab.state.workspaceId
    const siblings = this.tabsOf(workspaceId)
    const position = siblings.findIndex((t) => t.id === tabId)
    if (!isHomeUrl(tab.state.url)) {
      this.closed.push({ url: tab.state.url, title: tab.state.title, favicon: tab.state.favicon, workspaceId })
      if (this.closed.length > 25) this.closed.shift()
    }
    if (this.split && (this.split.primaryId === tabId || this.split.secondaryId === tabId)) {
      const other = this.split.primaryId === tabId ? this.split.secondaryId : this.split.primaryId
      this.split = null
      this.activeByWorkspace.set(workspaceId, other)
    }
    if (tab.view) this.detach(tab.view)
    tab.destroy()
    this.tabs.delete(tabId)
    this.openedFrom.delete(tabId)
    this.order = this.order.filter((id) => id !== tabId)

    if (this.activeByWorkspace.get(workspaceId) === tabId) {
      const remaining = this.tabsOf(workspaceId)
      const next = remaining[Math.min(position, remaining.length - 1)]
      if (next) this.activeByWorkspace.set(workspaceId, next.id)
      else this.activeByWorkspace.delete(workspaceId)
    }
    if (this.tabsOf(workspaceId).length === 0 && options.keepWorkspaceAlive !== false) {
      // Un Courant n'est jamais vide : on rouvre une page d'accueil.
      this.createTab({ workspaceId, activate: workspaceId === this.activeWorkspaceId })
      return
    }
    if (workspaceId === this.activeWorkspaceId) {
      const active = this.activeTab()
      if (active) this.activate(active.id)
    }
    this.schedule()
  }

  closeOthers(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    for (const other of this.tabsOf(tab.state.workspaceId)) if (other.id !== tabId) this.closeTab(other.id)
    this.activate(tabId)
  }

  duplicate(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (tab) this.createTab({ url: tab.state.url, workspaceId: tab.state.workspaceId, afterId: tab.id })
  }

  reopenClosed(): void {
    const last = this.closed.pop()
    if (!last) return
    const workspaceId = this.workspaces.some((w) => w.id === last.workspaceId) ? last.workspaceId : this.activeWorkspaceId
    this.createTab({ url: last.url, workspaceId, title: last.title, favicon: last.favicon })
  }

  navigate(tabId: number, input: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    const url = resolveInput(input, this.services.settings.get().searchEngine)
    if (!isAllowedTabUrl(url)) return
    // Mode responsive : la page s'ouvre sur tous les appareils (pas de page interne émulée).
    if (this.services.responsive.activeTabId === tabId && !url.startsWith('kaze:')) {
      tab.state.url = url
      this.services.responsive.load(url)
      this.schedule()
      return
    }
    tab.load(url)
    tab.contents?.focus()
  }

  go(tabId: number, action: 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop' | 'home'): void {
    if (this.services.responsive.activeTabId === tabId && action !== 'home') return this.services.responsive.go(action)
    this.tabs.get(tabId)?.go(action, this.homeUrl())
  }

  /** Les onglets éveillés au format chrome.tabs (pour les extensions), l'onglet affiché étant actif. */
  extensionTabs(): ExtensionTab[] {
    const current = this.currentTab()
    return this.allTabs()
      .filter((tab) => tab.contents)
      .map((tab, index) => {
        const active = tab === current
        return {
          id: tab.contents!.id,
          index,
          windowId: 1,
          active,
          highlighted: active,
          selected: active,
          pinned: false,
          incognito: false,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
          audible: tab.state.audible,
          mutedInfo: { muted: tab.state.muted },
          status: tab.state.loading ? 'loading' : 'complete',
          url: tab.state.url,
          title: tab.state.title,
          ...(tab.state.favicon ? { favIconUrl: tab.state.favicon } : {})
        }
      })
  }

  /**
   * Lance le mode responsive sur un onglet (page web uniquement), ou l'arrête (null, ou même
   * onglet). À l'arrêt, l'onglet reprend à la page où en étaient les appareils.
   */
  toggleResponsive(tabId: number | null): void {
    const { responsive } = this.services
    const current = responsive.activeTabId
    if (current !== null) {
      const url = responsive.stop()
      const tab = this.tabs.get(current)
      if (tab && url && tab.contents?.getURL() !== url) tab.load(url)
      if (tabId === null || tabId === current) return
    }
    const tab = tabId === null ? undefined : this.tabs.get(tabId)
    if (!tab || !/^https?:|^file:/i.test(tab.state.url)) return
    if (this.split) this.closeSplit()
    this.activate(tab.id)
    responsive.start(tab.id, tab.state.url)
  }

  move(tabId: number, index: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    // `index` est la position voulue parmi les onglets du même Courant.
    const siblings = this.tabsOf(tab.state.workspaceId).filter((t) => t.id !== tabId)
    const target = siblings[Math.min(index, siblings.length)]
    this.order = this.order.filter((id) => id !== tabId)
    const at = target ? this.order.indexOf(target.id) : this.order.length
    this.order.splice(at === -1 ? this.order.length : at, 0, tabId)
    this.openedFrom.delete(tabId)
    this.schedule()
  }

  sleepTab(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab || !tab.view) return
    if (tab.id === this.activeTab()?.id || this.isInSplit(tab.id)) return
    this.detach(tab.view)
    tab.sleep()
    this.schedule()
  }

  toggleBookmark(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab || isHomeUrl(tab.state.url) || !/^(https?|file):/i.test(tab.state.url)) return
    this.services.bookmarks.toggle(tab.state.url, tab.state.title, tab.state.favicon)
  }

  find(tabId: number, text: string, options: { forward: boolean; findNext: boolean }): void {
    this.tabs.get(tabId)?.find(text, options)
  }

  stopFind(tabId: number): void {
    this.tabs.get(tabId)?.stopFind()
  }

  toggleDevTools(tabId: number): void {
    const contents = this.tabs.get(tabId)?.contents
    if (!contents) return
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    else contents.openDevTools({ mode: 'detach' })
  }

  showTabMenu(tabId: number): void {
    const tab = this.tabs.get(tabId)
    if (tab) tabContextMenu(this, tab).popup({ window: this.win })
  }

  private isInSplit(tabId: number): boolean {
    return this.split !== null && (this.split.primaryId === tabId || this.split.secondaryId === tabId)
  }

  // ───────────────────────── Courants ─────────────────────────

  listWorkspaces(): Workspace[] {
    return this.workspaces
  }

  createWorkspace(fields: Omit<Workspace, 'id'>): string {
    const workspace: Workspace = { id: newId(), ...fields }
    this.workspaces.push(workspace)
    this.activateWorkspace(workspace.id)
    return workspace.id
  }

  updateWorkspace(id: string, patch: Partial<Omit<Workspace, 'id'>>): void {
    const workspace = this.workspaces.find((w) => w.id === id)
    if (!workspace) return
    Object.assign(workspace, patch)
    this.schedule()
  }

  deleteWorkspace(id: string): void {
    if (this.workspaces.length <= 1 || !this.workspaces.some((w) => w.id === id)) return
    for (const tab of this.tabsOf(id)) this.closeTab(tab.id, { keepWorkspaceAlive: false })
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    this.activeByWorkspace.delete(id)
    if (this.activeWorkspaceId === id) this.activateWorkspace(this.workspaces[0]!.id)
    this.schedule()
  }

  activateWorkspace(id: string): void {
    if (!this.workspaces.some((w) => w.id === id)) return
    if (id !== this.activeWorkspaceId) this.split = null
    this.activeWorkspaceId = id
    const tabs = this.tabsOf(id)
    if (tabs.length === 0) {
      this.createTab({ workspaceId: id })
      return
    }
    const remembered = this.activeByWorkspace.get(id)
    this.activate(remembered !== undefined && this.tabs.has(remembered) ? remembered : tabs[0]!.id)
  }

  moveTabToWorkspace(tabId: number, workspaceId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.state.workspaceId === workspaceId || !this.workspaces.some((w) => w.id === workspaceId)) return
    const from = tab.state.workspaceId
    const wasActive = this.activeByWorkspace.get(from) === tabId
    if (this.isInSplit(tabId)) this.split = null
    if (tab.view) this.detach(tab.view)
    tab.state.workspaceId = workspaceId
    this.order = [...this.order.filter((i) => i !== tabId), tabId]
    if (!this.activeByWorkspace.has(workspaceId)) this.activeByWorkspace.set(workspaceId, tabId)
    if (wasActive) {
      const next = this.tabsOf(from)[0]
      if (next) this.activeByWorkspace.set(from, next.id)
      else {
        this.activeByWorkspace.delete(from)
        this.createTab({ workspaceId: from, activate: from === this.activeWorkspaceId })
      }
      if (from === this.activeWorkspaceId) {
        const active = this.activeTab()
        if (active) this.activate(active.id)
      }
    }
    this.schedule()
  }

  // ───────────────────────── Split view ─────────────────────────

  openSplit(secondaryId: number): void {
    const primary = this.activeTab()
    const secondary = this.tabs.get(secondaryId)
    if (!primary || !secondary || primary.id === secondaryId) return
    if (this.services.responsive.activeTabId !== null) this.toggleResponsive(null)
    if (secondary.state.workspaceId !== this.activeWorkspaceId) this.moveTabToWorkspace(secondaryId, this.activeWorkspaceId)
    this.split = { primaryId: primary.id, secondaryId, focused: 'secondary' }
    this.activeByWorkspace.set(this.activeWorkspaceId, secondaryId)
    secondary.wake()
    this.applyLayout()
    this.schedule()
  }

  closeSplit(): void {
    if (!this.split) return
    const keep = this.currentTab()
    this.split = null
    if (keep) this.activate(keep.id)
    this.schedule()
  }

  focusSplit(side: SplitSide): void {
    if (!this.split) return
    this.split.focused = side
    const tab = this.currentTab()
    if (tab) {
      this.activeByWorkspace.set(this.activeWorkspaceId, tab.id)
      tab.contents?.focus()
    }
    this.schedule()
  }

  swapSplit(): void {
    if (!this.split) return
    this.split = {
      primaryId: this.split.secondaryId,
      secondaryId: this.split.primaryId,
      focused: this.split.focused === 'primary' ? 'secondary' : 'primary'
    }
    this.applyLayout()
    this.schedule()
  }

  /** Ctrl+Shift+S : ouvre le split avec l'onglet consulté juste avant, ou le ferme. */
  toggleSplit(): void {
    if (this.split) return this.closeSplit()
    const active = this.activeTab()
    if (!active) return
    const candidate = this.tabsOf(this.activeWorkspaceId)
      .filter((t) => t.id !== active.id)
      .sort((a, b) => b.lastSeen - a.lastSeen)[0]
    const secondaryId = candidate?.id ?? this.createTab({ activate: false })
    this.openSplit(secondaryId)
  }

  // ───────────────────────── Panneau latéral ─────────────────────────

  openPanel(appId: string | null): void {
    if (appId === null || appId === this.panelOpenId) {
      this.panelOpenId = null
    } else {
      const app = this.panelApps.find((a) => a.id === appId)
      if (!app) return
      if (!this.panelViews.has(appId)) this.panelViews.set(appId, this.createPanelView(app))
      this.panelOpenId = appId
    }
    this.applyLayout()
    this.schedule()
  }

  addPanelApp(name: string, input: string): void {
    const url = resolveInput(input, this.services.settings.get().searchEngine)
    if (!/^https?:/i.test(url)) return
    const app: PanelApp = { id: newId(), name, url, favicon: null }
    this.panelApps.push(app)
    this.openPanel(app.id)
  }

  removePanelApp(appId: string): void {
    const view = this.panelViews.get(appId)
    if (view) {
      this.detach(view)
      view.webContents.close()
      this.panelViews.delete(appId)
    }
    this.panelApps = this.panelApps.filter((a) => a.id !== appId)
    if (this.panelOpenId === appId) this.panelOpenId = null
    this.applyLayout()
    this.schedule()
  }

  private createPanelView(app: PanelApp): WebContentsView {
    const view = new WebContentsView({
      webPreferences: { session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true }
    })
    view.setBackgroundColor('#FFFFFF')
    const contents = view.webContents
    contents.on('page-favicon-updated', (_e, favicons) => {
      const favicon = favicons.find((f) => /^(https?|data):/i.test(f))
      if (favicon && favicon !== app.favicon) {
        app.favicon = favicon
        this.schedule()
      }
    })
    contents.on('before-input-event', (event, input) => {
      if (this.handleInput(input, contents)) event.preventDefault()
    })
    contents.on('context-menu', (_e, params) => {
      // Menu simplifié : les web apps du panneau n'ont pas d'onglet associé.
      const tab = this.currentTab()
      if (tab) pageContextMenu(this, tab, params, contents).popup({ window: this.win })
    })
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === 'new-window' && isAllowedTabUrl(url) && !url.startsWith('kaze:')) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } }
      }
      if (isAllowedTabUrl(url) && !url.startsWith('kaze:')) this.createTab({ url })
      return { action: 'deny' }
    })
    contents.on('will-navigate', (details) => {
      if (!isAllowedTabUrl(details.url) || details.url.startsWith('kaze:')) details.preventDefault()
    })
    void whenIdentityReady(contents).then(() => contents.loadURL(app.url).catch(() => undefined))
    return view
  }

  // ───────────────────────── Disposition des vues ─────────────────────────

  setViewport(viewport: Viewport): void {
    this.viewport = viewport
    this.applyLayout()
  }

  private detach(view: WebContentsView): void {
    if (!this.attached.has(view)) return
    this.win.contentView.removeChildView(view)
    this.attached.delete(view)
  }

  /** Place les pages visibles dans les zones mesurées par l'interface et retire les autres. */
  applyLayout(): void {
    if (this.win.isDestroyed()) return
    const wanted = new Map<WebContentsView, Rect>()
    const shown: Tab[] = []
    if (!this.frozen) {
      const visible = (tab: Tab | undefined): tab is Tab & { view: WebContentsView } =>
        !!tab && !!tab.view && !tab.state.error && !tab.state.stormBlocked
      const fullscreenTab = this.fullscreenTabId !== null ? this.tabs.get(this.fullscreenTabId) : undefined
      if (visible(fullscreenTab)) {
        const [width, height] = this.win.getContentSize()
        wanted.set(fullscreenTab.view, { x: 0, y: 0, width: width!, height: height! })
        shown.push(fullscreenTab)
      } else {
        const pairs: [Tab | undefined, Rect | null][] = this.split
          ? [
              [this.tabs.get(this.split.primaryId), this.viewport.primary],
              [this.tabs.get(this.split.secondaryId), this.viewport.secondary]
            ]
          : [[this.activeTab(), this.viewport.primary]]
        // Mode responsive : les appareils remplacent la page de l'onglet.
        const responsiveTab = !this.split && this.services.responsive.activeTabId === this.activeTab()?.id ? this.activeTab() : undefined
        if (responsiveTab) {
          pairs.length = 0
          for (const [view, rect] of this.services.responsive.layout(this.viewport.responsive)) wanted.set(view, rect)
          shown.push(responsiveTab)
        }
        for (const [tab, rect] of pairs) {
          if (visible(tab) && rect && rect.width > 0 && rect.height > 0) {
            wanted.set(tab.view, rect)
            shown.push(tab)
          }
        }
        const panelView = this.panelOpenId ? this.panelViews.get(this.panelOpenId) : undefined
        if (panelView && this.viewport.panel && this.viewport.panel.width > 0) wanted.set(panelView, this.viewport.panel)
      }
    }
    for (const view of [...this.attached]) {
      if (!wanted.has(view)) {
        const tab = this.allTabs().find((t) => t.view === view)
        if (tab) tab.lastSeen = Date.now()
        this.detach(view)
      }
    }
    for (const [view, rect] of wanted) {
      if (!this.attached.has(view)) {
        this.win.contentView.addChildView(view)
        this.attached.add(view)
      }
      view.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    const now = Date.now()
    for (const tab of shown) tab.lastSeen = now
  }

  /** Capture les pages visibles puis les retire, le temps qu'une fenêtre flottante s'affiche. */
  async freeze(): Promise<FrozenView[]> {
    const token = ++this.freezeToken
    const views = [...this.attached]
    const shots = await Promise.all(
      views.map(async (view) => {
        try {
          const bounds = view.getBounds()
          const image = await view.webContents.capturePage()
          return { rect: bounds, image: `data:image/jpeg;base64,${image.toJPEG(82).toString('base64')}` }
        } catch {
          return null
        }
      })
    )
    if (token !== this.freezeToken) return []
    this.frozen = true
    this.applyLayout()
    return shots.filter((s): s is FrozenView => s !== null)
  }

  unfreeze(): void {
    this.freezeToken++
    this.frozen = false
    this.applyLayout()
  }

  // ───────────────────────── Tempête et Brise ─────────────────────────

  private applyStorm(): void {
    const { storm } = this.services
    for (const tab of this.tabs.values()) {
      const blocked = storm.blockedHost(tab.state.url)
      if (blocked && !tab.state.stormBlocked) {
        tab.state.stormBlocked = blocked
        tab.contents?.stop()
      } else if (!blocked && tab.state.stormBlocked) {
        tab.state.stormBlocked = null
        if (tab.view) tab.load(tab.state.url)
      }
    }
    this.applyLayout()
    this.schedule()
  }

  private breezeTick(): void {
    const { enabled, minutes } = this.services.settings.get().breeze
    if (!enabled) return
    const limit = Date.now() - minutes * 60_000
    for (const tab of this.tabs.values()) {
      if (!tab.view || tab.state.audible || tab.lastSeen > limit) continue
      if (tab.view && this.attached.has(tab.view)) continue
      this.sleepTab(tab.id)
    }
  }

  // ───────────────────────── Raccourcis clavier ─────────────────────────

  private rebuildShortcutMap(settings: Settings): void {
    this.shortcutMap = new Map()
    const bindings = { ...DEFAULT_SETTINGS.shortcuts, ...settings.shortcuts }
    for (const [action, combo] of Object.entries(bindings)) {
      if (isShortcutAction(action) && combo) this.shortcutMap.set(combo, action)
    }
  }

  setShortcutsSuspended(suspended: boolean): void {
    this.shortcutsSuspended = suspended
  }

  /** Traite une touche (interface, onglet ou panneau). Renvoie true si elle a été consommée. */
  handleInput(input: Input, source: WebContents): boolean {
    if (input.type !== 'keyDown') return false
    if (this.shortcutsSuspended && source === this.ui) return false
    const combo = normalizeKeyPress({
      key: input.key,
      code: input.code,
      ctrl: input.control,
      alt: input.alt,
      shift: input.shift,
      meta: input.meta
    })
    if (!combo) return false
    if (STUDIO_KEYS.has(combo) && isStudioUrl(source.getURL())) return false
    const digit = /^Ctrl\+([1-9])$/.exec(combo)
    if (digit) {
      const tabs = this.tabsOf(this.activeWorkspaceId)
      const n = Number(digit[1])
      const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
      if (target) this.activate(target.id)
      return true
    }
    const action = this.shortcutMap.get(combo)
    if (!action) return false
    this.runAction(action)
    return true
  }

  runAction(action: ShortcutAction): void {
    const tab = this.currentTab()
    const { settings } = this.services
    switch (action) {
      case 'tab.new':
        this.createTab({})
        this.uiCommand('focus-address')
        break
      case 'tab.close':
        if (tab) this.closeTab(tab.id)
        break
      case 'tab.reopen':
        this.reopenClosed()
        break
      case 'tab.next':
      case 'tab.previous': {
        const tabs = this.tabsOf(this.activeWorkspaceId)
        const index = tabs.findIndex((t) => t.id === tab?.id)
        const delta = action === 'tab.next' ? 1 : -1
        const target = tabs[(index + delta + tabs.length) % tabs.length]
        if (target) this.activate(target.id)
        break
      }
      case 'address.focus':
        this.uiCommand('focus-address')
        break
      case 'souffle.open':
        this.uiCommand('open-souffle')
        break
      case 'page.reload':
      case 'page.reloadAlt':
        if (tab) tab.go('reload')
        break
      case 'page.hardReload':
        if (tab) tab.go('hard-reload')
        break
      case 'page.back':
        if (tab) tab.go('back')
        break
      case 'page.forward':
        if (tab) tab.go('forward')
        break
      case 'page.home':
        if (tab) tab.go('home', this.homeUrl())
        break
      case 'page.find':
        this.uiCommand('open-find')
        break
      case 'page.devtools':
        if (tab) this.toggleDevTools(tab.id)
        break
      case 'bookmark.toggle':
        if (tab) this.toggleBookmark(tab.id)
        break
      case 'history.open':
        this.uiCommand('open-history')
        break
      case 'bookmarks.open':
        this.uiCommand('open-bookmarks')
        break
      case 'downloads.open':
        this.uiCommand('open-downloads')
        break
      case 'zoom.in':
        tab?.zoom('in')
        break
      case 'zoom.out':
        tab?.zoom('out')
        break
      case 'zoom.reset':
        tab?.zoom('reset')
        break
      case 'sidebar.toggle':
        settings.set({ sidebarCollapsed: !settings.get().sidebarCollapsed })
        break
      case 'split.toggle':
        this.toggleSplit()
        break
      case 'responsive.toggle':
        this.toggleResponsive(this.services.responsive.activeTabId ?? this.activeTab()?.id ?? null)
        break
      case 'settings.open':
        this.uiCommand('open-settings')
        break
      case 'studio.open':
        this.openStudio()
        break
      case 'window.fullscreen':
        this.win.setFullScreen(!this.win.isFullScreen())
        break
    }
  }

  /** Demande une action à l'interface ; elle reçoit aussi le focus clavier. */
  uiCommand(command: UiCommand): void {
    this.ui.focus()
    emit(this.ui, 'ui:command', command)
  }

  // ───────────────────────── Kaze Studio ─────────────────────────

  /** Ouvre Kaze Studio (ou revient à son onglet s'il est déjà ouvert dans ce Courant). */
  openStudio(): void {
    const existing = this.tabsOf(this.activeWorkspaceId).find((t) => isStudioUrl(t.state.url))
    if (existing) this.activate(existing.id)
    else this.createTab({ url: STUDIO_URL })
  }

  /** « Ouvrir dans Kaze Studio » : copie la page en cours dans un projet local. */
  async openPageInStudio(tabId: number): Promise<void> {
    const contents = this.tabs.get(tabId)?.contents
    if (!contents || !/^https?:/.test(contents.getURL())) return
    const file = await this.services.studio.capturePage(contents)
    this.openStudio()
    // La page Studio ouvre le fichier dès qu'elle est prête.
    setTimeout(() => this.services.studio.emit('event', { type: 'open-file', path: file }), 800)
  }

  // ───────────────────────── Page d'accueil ─────────────────────────

  homeData(): HomeData {
    const settings = this.services.settings.get()
    return {
      theme: this.services.settings.resolvedTheme(),
      palette: this.services.settings.activeTheme().colors,
      userName: settings.userName,
      engineName: SEARCH_ENGINES[settings.searchEngine].name,
      shortcuts: this.services.bookmarks.list().slice(0, settings.appearance.home.shortcutsCount),
      appearance: settings.appearance,
      widgets: this.services.home.widgets(),
      persoBase: PERSO_BASE
    }
  }

  private pushHomeData(): void {
    const data = this.homeData()
    for (const tab of this.tabs.values()) {
      if (isHomeUrl(tab.state.url)) emit(tab.contents, 'interne:home-changed', data)
      if (tab.state.url.startsWith('kaze:')) tab.view?.setBackgroundColor(this.internalBackground())
    }
  }

  // ───────────────────────── État diffusé à l'interface ─────────────────────────

  getState(): BrowserState {
    const { shield, storm, settings } = this.services
    const current = this.currentTab()
    const theme = settings.activeTheme()
    return {
      theme: theme.dark ? 'sombre' : 'clair',
      palette: theme.colors,
      themeId: theme.id,
      workspaces: this.workspaces,
      activeWorkspaceId: this.activeWorkspaceId,
      tabs: this.allTabs().map((t) => t.state),
      activeTabId: current?.id ?? null,
      split: this.split,
      panel: { apps: this.panelApps, openId: this.panelOpenId },
      shield: {
        enabled: shield.enabled,
        ready: shield.ready,
        totalBlocked: shield.totalBlocked,
        siteAllowed: current ? shield.isSiteAllowed(current.state.url) : false
      },
      storm: { active: storm.active, until: storm.until },
      responsive: this.services.responsive.state,
      vpn: this.services.vpn.state,
      breeze: {
        enabled: settings.get().breeze.enabled,
        sleeping: this.allTabs().filter((t) => t.state.asleep).length
      },
      htmlFullscreen: this.fullscreenTabId !== null,
      closedTabsCount: this.closed.length
    }
  }

  /** Regroupe les changements : un seul envoi d'état par intervalle. */
  schedule(delay = 16): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, delay)
  }

  private flush(): void {
    if (this.win.isDestroyed()) return
    this.applyLayout()
    emit(this.ui, 'browser:state', this.getState())
    this.saveSession()
  }

  private updateWindowTitle(): void {
    const title = this.currentTab()?.state.title
    if (!this.win.isDestroyed()) this.win.setTitle(title ? `${title} — Kaze` : 'Kaze')
  }

  private saveSession(): void {
    const active = new Set(this.activeByWorkspace.values())
    this.sessionStore.set({
      workspaces: this.workspaces,
      activeWorkspaceId: this.activeWorkspaceId,
      tabs: this.allTabs().map((t) => ({
        workspaceId: t.state.workspaceId,
        url: t.state.url,
        title: t.state.title,
        favicon: t.state.favicon,
        active: active.has(t.id)
      })),
      panelApps: this.panelApps
    })
  }
}

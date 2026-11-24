/**
 * Un onglet : une WebContentsView (la page) et l'état affiché par l'interface.
 *
 * Quand Brise met l'onglet en veille, la vue est détruite (la mémoire du processus de
 * rendu est libérée) ; on garde seulement l'adresse, le titre et l'icône. La page est
 * rechargée quand on revient sur l'onglet.
 */
import { WebContentsView, type ContextMenuParams, type Input, type Session, type WebContents } from 'electron'
import { HOME_URL, isAllowedTabUrl } from '@shared/url'
import type { FindResult, PageError, TabState } from '@shared/types'
import { whenIdentityReady } from '../services/chrome-identity'
import { t } from '@shared/i18n'

/** Pages internes de Kaze (fond aux couleurs du thème plutôt que blanc). */
const isInternal = (url: string): boolean => url.startsWith('kaze:')

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Ce dont un onglet a besoin de la part du contrôleur. */
export interface TabHost {
  session: Session
  preloadPath: string
  /** Couleur de fond des pages internes (selon le thème). */
  internalBackground(): string
  changed(tab: Tab): void
  openTab(url: string, options: { background: boolean; opener: Tab }): void
  /** Une page a été visitée, ou son titre / son icône a changé (historique, favoris). */
  visited(tab: Tab, kind: 'navigate' | 'title' | 'favicon'): void
  isBookmarked(url: string): boolean
  stormBlockedHost(url: string): string | null
  handleInput(input: Input, source: WebContents): boolean
  showContextMenu(tab: Tab, params: ContextMenuParams): void
  findResult(result: FindResult): void
  fullscreen(tab: Tab, enabled: boolean): void
  focused(tab: Tab): void
  /** La page est prête (DOM chargé) : règles CSS/JS par site. */
  pageReady(tab: Tab): void
}

export interface TabInit {
  id: number
  workspaceId: string
  url: string
  title?: string
  favicon?: string | null
}

export class Tab {
  view: WebContentsView | null = null
  readonly state: TabState
  /** Dernier moment où l'onglet était affiché (pour Brise). */
  lastSeen = Date.now()
  /** Recherche dans la page en cours (pour reprendre au même endroit). */
  private findText = ''

  constructor(
    private readonly host: TabHost,
    init: TabInit
  ) {
    this.state = {
      id: init.id,
      workspaceId: init.workspaceId,
      url: init.url,
      title: init.title ?? '',
      favicon: init.favicon ?? null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      audible: false,
      muted: false,
      asleep: true,
      blockedCount: 0,
      bookmarked: host.isBookmarked(init.url),
      zoom: 1,
      error: null,
      stormBlocked: null,
      createdAt: Date.now()
    }
  }

  get id(): number {
    return this.state.id
  }

  get contents(): WebContents | null {
    const contents = this.view?.webContents
    return contents && !contents.isDestroyed() ? contents : null
  }

  /** Crée la page si l'onglet dort, puis charge son adresse. */
  wake(): void {
    if (this.view) return
    this.state.asleep = false
    this.view = this.createView()
    this.load(this.state.url)
  }

  /** Met l'onglet en veille (Brise) : la page est détruite, seul l'état est conservé. */
  sleep(): void {
    if (!this.view) return
    const contents = this.contents
    if (contents) contents.close()
    this.view = null
    this.state.asleep = true
    this.state.loading = false
    this.state.audible = false
    this.host.changed(this)
  }

  destroy(): void {
    const contents = this.contents
    if (contents) contents.close()
    this.view = null
  }

  /** Charge une adresse (déjà résolue et validée). */
  load(url: string): void {
    if (!isAllowedTabUrl(url)) return
    this.state.url = url
    this.state.error = null
    const blocked = this.host.stormBlockedHost(url)
    this.state.stormBlocked = blocked
    if (blocked) {
      this.host.changed(this)
      return
    }
    if (!this.view) {
      this.wake()
      return
    }
    this.view.setBackgroundColor(isInternal(url) ? this.host.internalBackground() : '#FFFFFF')
    const contents = this.contents
    // La page attend l'identité Chrome avant sa toute première requête.
    if (contents) void whenIdentityReady(contents).then(() => contents.loadURL(url).catch(() => undefined))
    this.host.changed(this)
  }

  go(action: 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop' | 'home', homeUrl = HOME_URL): void {
    if (action === 'home') return this.load(homeUrl)
    if (this.state.stormBlocked && (action === 'reload' || action === 'hard-reload')) {
      return this.load(this.state.url)
    }
    const contents = this.contents
    if (!contents) {
      if (action === 'reload' || action === 'hard-reload') this.wake()
      return
    }
    const history = contents.navigationHistory
    if (action === 'back' && history.canGoBack()) history.goBack()
    else if (action === 'forward' && history.canGoForward()) history.goForward()
    else if (action === 'reload') {
      this.state.error ? contents.loadURL(this.state.url).catch(() => undefined) : contents.reload()
    } else if (action === 'hard-reload') contents.reloadIgnoringCache()
    else if (action === 'stop') contents.stop()
  }

  toggleMute(): void {
    const contents = this.contents
    if (!contents) return
    contents.setAudioMuted(!contents.isAudioMuted())
    this.state.muted = contents.isAudioMuted()
    this.host.changed(this)
  }

  zoom(direction: 'in' | 'out' | 'reset'): void {
    const contents = this.contents
    if (!contents) return
    const current = contents.getZoomFactor()
    let next = 1
    if (direction === 'in') next = ZOOM_STEPS.find((z) => z > current + 0.001) ?? current
    if (direction === 'out') next = [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? current
    contents.setZoomFactor(next)
    this.state.zoom = next
    this.host.changed(this)
  }

  find(text: string, options: { forward: boolean; findNext: boolean }): void {
    const contents = this.contents
    if (!contents) return
    // Pour Electron, `findNext: true` démarre une NOUVELLE recherche ; false passe au résultat suivant.
    const followUp = options.findNext && text === this.findText
    this.findText = text
    contents.findInPage(text, { forward: options.forward, findNext: !followUp })
  }

  stopFind(): void {
    this.findText = ''
    this.contents?.stopFindInPage('clearSelection')
  }

  /** Met à jour les indicateurs de navigation (retour, avancer). */
  private syncNavigation(): void {
    const contents = this.contents
    if (!contents) return
    this.state.canGoBack = contents.navigationHistory.canGoBack()
    this.state.canGoForward = contents.navigationHistory.canGoForward()
  }

  private createView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        session: this.host.session,
        // Ce preload n'expose quelque chose qu'aux pages kaze://accueil.
        preload: this.host.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        safeDialogs: true,
        spellcheck: true
      }
    })
    view.setBackgroundColor(isInternal(this.state.url) ? this.host.internalBackground() : '#FFFFFF')
    this.bind(view.webContents)
    return view
  }

  private bind(contents: WebContents): void {
    const changed = (): void => this.host.changed(this)

    contents.on('did-start-loading', () => {
      this.state.loading = true
      changed()
    })
    contents.on('did-stop-loading', () => {
      this.state.loading = false
      this.syncNavigation()
      changed()
    })

    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      // Retour / avancer vers un site bloqué par Tempête.
      const blocked = this.host.stormBlockedHost(details.url)
      if (blocked) {
        contents.stop()
        this.state.url = details.url
        this.state.stormBlocked = blocked
        changed()
        return
      }
      this.state.error = null
      this.state.stormBlocked = null
      this.view?.setBackgroundColor(isInternal(details.url) ? this.host.internalBackground() : '#FFFFFF')
    })

    contents.on('will-navigate', (details) => {
      const target = details.url
      // Une page web ne peut pas ouvrir une page interne, ni une adresse non autorisée.
      const fromInternal = contents.getURL().startsWith('kaze:')
      if (!isAllowedTabUrl(target) || (target.startsWith('kaze:') && !fromInternal)) {
        details.preventDefault()
        return
      }
      const blocked = this.host.stormBlockedHost(target)
      if (blocked) {
        details.preventDefault()
        this.state.url = target
        this.state.stormBlocked = blocked
        changed()
      }
    })

    contents.on('will-redirect', (details) => {
      if (!details.isMainFrame) return
      if (!isAllowedTabUrl(details.url) || details.url.startsWith('kaze:')) {
        details.preventDefault()
        return
      }
      const blocked = this.host.stormBlockedHost(details.url)
      if (blocked) {
        details.preventDefault()
        this.state.url = details.url
        this.state.stormBlocked = blocked
        changed()
      }
    })

    contents.on('did-navigate', (_event, url) => {
      this.state.url = url
      this.state.blockedCount = 0
      this.state.bookmarked = this.host.isBookmarked(url)
      this.state.zoom = contents.getZoomFactor()
      this.syncNavigation()
      this.host.visited(this, 'navigate')
      changed()
    })

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      this.state.url = url
      this.state.bookmarked = this.host.isBookmarked(url)
      this.syncNavigation()
      this.host.visited(this, 'navigate')
      changed()
    })

    contents.on('page-title-updated', (_event, title) => {
      this.state.title = title
      this.host.visited(this, 'title')
      changed()
    })

    contents.on('page-favicon-updated', (_event, favicons) => {
      const favicon = favicons.find((f) => /^(https?|data):/i.test(f)) ?? null
      if (favicon && favicon !== this.state.favicon) {
        this.state.favicon = favicon
        this.host.visited(this, 'favicon')
        changed()
      }
    })

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 = navigation annulée (clic sur un autre lien, arrêt…) : pas une vraie erreur.
      if (!isMainFrame || errorCode === -3) return
      const error: PageError = { code: errorCode, description: errorDescription, url: validatedURL }
      this.state.error = error
      this.state.url = validatedURL || this.state.url
      this.state.loading = false
      changed()
    })

    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return
      this.state.error = { code: -1000, description: t('La page a cessé de fonctionner'), url: this.state.url }
      this.state.loading = false
      changed()
    })

    contents.on('audio-state-changed', (event) => {
      this.state.audible = event.audible
      changed()
    })

    contents.on('zoom-changed', (_event, direction) => this.zoom(direction))

    contents.on('found-in-page', (_event, result) => {
      this.host.findResult({ tabId: this.id, activeMatch: result.activeMatchOrdinal, matches: result.matches })
    })

    contents.on('enter-html-full-screen', () => this.host.fullscreen(this, true))
    contents.on('leave-html-full-screen', () => this.host.fullscreen(this, false))
    contents.on('focus', () => this.host.focused(this))
    contents.on('dom-ready', () => this.host.pageReady(this))

    contents.on('context-menu', (_event, params) => this.host.showContextMenu(this, params))

    contents.on('before-input-event', (event, input) => {
      if (this.host.handleInput(input, contents)) event.preventDefault()
    })

    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (!isAllowedTabUrl(url) || url.startsWith('kaze:')) return { action: 'deny' }
      // Les vraies fenêtres popup (connexion OAuth…) gardent le lien avec leur page d'origine.
      if (disposition === 'new-window') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            autoHideMenuBar: true,
            backgroundColor: '#FFFFFF',
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
          }
        }
      }
      this.host.openTab(url, { background: disposition === 'background-tab', opener: this })
      return { action: 'deny' }
    })
  }
}

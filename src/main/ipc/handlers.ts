/**
 * Branchement de tous les canaux du contrat IPC sur le contrôleur et les services.
 */
import { app, BrowserWindow, dialog, shell, type Session } from 'electron'
import type { Suggestion, WelcomeData } from '@shared/types'
import type { SettingsPatch } from '@shared/settings'
import { PRESET_THEMES } from '@shared/themes'
import { displayUrl, isAllowedTabUrl, isHomeUrl, resolveInput, searchUrl } from '@shared/url'
import type { BrowserController, Services } from '../browser/controller'
import { fold } from '../services/history'
import type { PermissionsService } from '../services/permissions'
import type { PersoService } from '../services/perso'
import type { UpdaterService } from '../services/updater'
import type { ExtensionsService } from '../services/extensions'
import { windowState } from '../window'
import { emit, handle, handleInternal, handleStudio, listen } from './router'

export function registerIpc(
  win: BrowserWindow,
  browser: BrowserController,
  services: Services,
  permissions: PermissionsService,
  tabSession: Session,
  perso: PersoService,
  updater: UpdaterService,
  extensions: ExtensionsService
): void {
  const { settings, history, bookmarks, downloads, shield, storm, vpn, home, studio } = services

  // Fenêtre
  handle('window:minimize', () => win.minimize())
  handle('window:toggle-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  handle('window:close', () => win.close())
  handle('window:get-state', () => windowState(win))
  handle('window:toggle-fullscreen', () => win.setFullScreen(!win.isFullScreen()))
  handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    userData: app.getPath('userData')
  }))
  handle('app:open-external', () => void shell.openPath(app.getPath('userData')))

  // Onglets
  handle('browser:get-state', () => browser.getState())
  handle('tab:create', ([options]) => {
    const url = options.input ? resolveInput(options.input, settings.get().searchEngine) : undefined
    const id = browser.createTab({ url, activate: !options.background })
    if (!options.input) browser.uiCommand('focus-address')
    return id
  })
  handle('tab:close', ([id]) => browser.closeTab(id))
  handle('tab:activate', ([id]) => browser.activate(id))
  handle('tab:navigate', ([id, input]) => browser.navigate(id, input))
  handle('tab:go', ([id, action]) => browser.go(id, action))
  handle('tab:move', ([id, index]) => browser.move(id, index))
  handle('tab:mute', ([id]) => browser.get(id)?.toggleMute())
  handle('tab:reopen-closed', () => browser.reopenClosed())
  handle('tab:menu', ([id]) => browser.showTabMenu(id))
  handle('tab:zoom', ([id, direction]) => browser.get(id)?.zoom(direction))
  handle('tab:find', ([id, text, options]) => browser.find(id, text, options))
  handle('tab:find-stop', ([id]) => browser.stopFind(id))
  handle('tab:sleep', ([id]) => browser.sleepTab(id))
  handle('tab:devtools', ([id]) => browser.toggleDevTools(id))

  // Affichage
  handle('view:freeze', () => browser.freeze())
  handle('view:unfreeze', () => browser.unfreeze())
  listen('layout:viewport', ([viewport]) => browser.setViewport(viewport))

  // Courants
  handle('workspace:create', ([fields]) => browser.createWorkspace(fields))
  handle('workspace:update', ([id, patch]) => browser.updateWorkspace(id, patch))
  handle('workspace:delete', ([id]) => browser.deleteWorkspace(id))
  handle('workspace:activate', ([id]) => browser.activateWorkspace(id))
  handle('workspace:move-tab', ([tabId, workspaceId]) => browser.moveTabToWorkspace(tabId, workspaceId))

  // Split view et panneau latéral
  handle('split:open', ([id]) => browser.openSplit(id))
  handle('split:close', () => browser.closeSplit())
  handle('split:focus', ([side]) => browser.focusSplit(side))
  handle('split:swap', () => browser.swapSplit())
  handle('panel:open', ([id]) => browser.openPanel(id))
  handle('panel:add', ([app]) => browser.addPanelApp(app.name, app.url))
  handle('panel:remove', ([id]) => browser.removePanelApp(id))

  // Favoris
  handle('bookmarks:list', () => bookmarks.list())
  handle('bookmarks:add', ([b]) => {
    const url = resolveInput(b.url, settings.get().searchEngine)
    if (isAllowedTabUrl(url) && !isHomeUrl(url)) bookmarks.add(url, b.title)
  })
  handle('bookmarks:update', ([id, b]) => {
    const url = resolveInput(b.url, settings.get().searchEngine)
    if (isAllowedTabUrl(url)) bookmarks.update(id, { url, title: b.title })
  })
  handle('bookmarks:remove', ([id]) => bookmarks.remove(id))
  handle('bookmarks:toggle-tab', ([id]) => browser.toggleBookmark(id))

  // Historique et téléchargements
  handle('history:search', ([query, limit]) => history.search(query, limit))
  handle('history:remove', ([id]) => history.remove(id))
  handle('history:clear', ([range]) => history.clear(range))
  handle('downloads:list', () => downloads.list())
  handle('downloads:action', ([id, action]) => downloads.action(id, action))
  handle('downloads:clear', () => downloads.clear())

  // Paramètres
  handle('settings:get', () => settings.get())
  handle('settings:set', ([patch]) => settings.set(patch))
  handle('settings:reset-shortcuts', () => settings.resetShortcuts())
  handle('settings:choose-download-dir', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Dossier des téléchargements',
      defaultPath: settings.downloadDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    settings.set({ downloadDir: result.filePaths[0] })
    return result.filePaths[0]
  })
  handle('shortcuts:suspend', ([suspended]) => browser.setShortcutsSuspended(suspended))

  // Bouclier, Tempête, Brise
  handle('shield:toggle-site', ([id]) => {
    const tab = browser.get(id)
    if (tab) {
      shield.toggleSite(tab.state.url)
      tab.go('reload')
    }
  })
  handle('storm:start', ([minutes]) => storm.start(minutes))
  handle('storm:stop', () => storm.stop())

  // Brume (VPN) : les réglages pilotent le service, qui suit leurs changements.
  handle('vpn:set', ([enabled]) => {
    settings.set({ vpn: { ...settings.get().vpn, enabled } })
  })
  handle('vpn:country', ([country]) => {
    settings.set({ vpn: { ...settings.get().vpn, country } })
  })
  handle('vpn:reconnect', () => vpn.reconnect())

  // Extensions Chrome
  extensions.on('changed', (list) => emit(win.webContents, 'ext:changed', list))
  handle('ext:list', () => extensions.list())
  handle('ext:install', ([input]) => extensions.installFromStore(input))
  handle('ext:install-folder', () => extensions.installFromFolder(win))
  handle('ext:remove', ([path]) => extensions.remove(path))
  handle('ext:toggle', ([path, enabled]) => extensions.toggle(path, enabled))
  handle('ext:popup', ([path, rect]) => extensions.openPopup(path, win, rect))

  // Mode responsive
  handle('responsive:toggle', ([id]) => browser.toggleResponsive(id))

  // Suggestions de la barre d'adresse et de Souffle
  handle('suggest:query', ([query]) => suggest(query))

  handle('data:clear-browsing', async () => {
    await tabSession.clearStorageData()
    await tabSession.clearCache()
    await tabSession.clearAuthCache()
    permissions.clear()
  })

  // Personnalisation
  handle('perso:import', ([kind]) => perso.import(win, kind))
  handle('perso:google-font', ([family]) => perso.googleFont(family))
  handle('perso:remove-font', ([family]) => perso.removeFont(family))
  handle('theme:export', () => perso.exportTheme(win))
  handle('theme:import', () => perso.importTheme(win))
  handle('settings:reset', ([section]) => settings.reset(section))

  // Kaze Studio (depuis l'interface)
  handle('studio:open', () => browser.openStudio())
  handle('studio:open-page', ([id]) => browser.openPageInStudio(id))

  // Mises à jour automatiques
  handle('update:get', () => updater.get())
  handle('update:check', () => updater.check())
  handle('update:install', () => updater.install())
  updater.on('changed', (state) => emit(win.webContents, 'update:state', state))

  // Page d'accueil interne
  handleInternal('interne:get-home', () => browser.homeData())
  handleInternal('interne:navigate', ([input], event) => {
    const tab = browser.tabByContentsId(event.sender.id)
    if (tab) browser.navigate(tab.id, input)
  })
  handleInternal('interne:save-notes', ([notes]) => home.saveNotes(notes))
  handleInternal('interne:save-todos', ([todos]) => home.saveTodos(todos))
  handleInternal('interne:save-layout', ([widgets]) => {
    const a = settings.get().appearance
    settings.setAppearance({ home: { ...a.home, widgets } })
  })
  handleInternal('interne:weather', () => home.weather(settings.get().appearance.home.weatherCity))
  handleInternal('interne:daily-image', () => home.dailyImage())

  // Page de bienvenue (premier lancement)
  const welcomeData = (): WelcomeData => {
    const s = settings.get()
    const theme = settings.activeTheme()
    return {
      version: app.getVersion(),
      userName: s.userName,
      themeId: theme.id,
      tabPosition: s.appearance.tabPosition,
      searchEngine: s.searchEngine,
      theme: theme.dark ? 'sombre' : 'clair',
      palette: theme.colors,
      themes: [...PRESET_THEMES, ...s.appearance.customThemes]
    }
  }
  handleInternal('bienvenue:get', () => welcomeData())
  handleInternal('bienvenue:set', ([choice]) => {
    const s = settings.get()
    const patch: SettingsPatch = {}
    if (choice.userName !== undefined) patch.userName = choice.userName.trim()
    if (choice.searchEngine) patch.searchEngine = choice.searchEngine
    const knownTheme = choice.themeId && welcomeData().themes.some((t) => t.id === choice.themeId)
    if (knownTheme || choice.tabPosition) {
      patch.appearance = {
        ...s.appearance,
        ...(knownTheme ? { themeMode: 'manuel' as const, themeId: choice.themeId! } : {}),
        ...(choice.tabPosition ? { tabPosition: choice.tabPosition } : {})
      }
    }
    settings.set(patch)
    return welcomeData()
  })
  handleInternal('bienvenue:done', (_args, event) => {
    const tab = browser.tabByContentsId(event.sender.id)
    if (tab) browser.navigate(tab.id, browser.homeUrl())
  })

  // Kaze Studio (page kaze://studio)
  const studioWindow = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null => BrowserWindow.fromWebContents(event.sender) ?? win
  handleStudio('studio:get-state', () => studio.state())
  handleStudio('studio:open-folder', (_args, event) => studio.openFolder(studioWindow(event)))
  handleStudio('studio:open-file', (_args, event) => studio.openFile(studioWindow(event)))
  handleStudio('studio:open-recent', ([path]) => studio.openRecent(path))
  handleStudio('studio:new-project', ([name]) => studio.newProject(name))
  handleStudio('studio:list', ([rel]) => studio.list(rel))
  handleStudio('studio:read', ([rel]) => studio.read(rel))
  handleStudio('studio:write', ([rel, content]) => studio.write(rel, content))
  handleStudio('studio:create', ([dir, name, kind]) => studio.create(dir, name, kind))
  handleStudio('studio:rename', ([rel, name]) => studio.rename(rel, name))
  handleStudio('studio:move', ([rel, dir]) => studio.move(rel, dir))
  handleStudio('studio:delete', ([rel]) => studio.delete(rel))
  handleStudio('studio:overlay', ([rel, content]) => studio.setOverlay(rel, content))
  handleStudio('studio:refresh', ([kind, rel]) => studio.refresh(rel, kind))
  handleStudio('studio:export-zip', (_args, event) => studio.exportZip(studioWindow(event)))
  handleStudio('studio:preview-window', ([rel]) => studio.openPreviewWindow(rel))
  handleStudio('studio:settings', ([patch]) => studio.updateSettings(patch))

  /** Combine : action directe, onglets ouverts, favoris, historique (sans doublons). */
  function suggest(query: string): Suggestion[] {
    const text = query.trim()
    if (!text) return []
    const engine = settings.get().searchEngine
    const out: Suggestion[] = []
    const seen = new Set<string>()
    const push = (s: Suggestion): void => {
      if (seen.has(s.url) && s.kind !== 'onglet') return
      seen.add(s.url)
      out.push(s)
    }
    const resolved = resolveInput(text, engine)
    const search = searchUrl(text, engine)
    if (resolved !== search) push({ kind: 'url', title: displayUrl(resolved) || resolved, url: resolved, favicon: null })

    const q = fold(text)
    browser
      .allTabs()
      .filter((t) => fold(`${t.state.title} ${t.state.url}`).includes(q))
      .slice(0, 3)
      .forEach((t) => push({ kind: 'onglet', title: t.state.title || displayUrl(t.state.url), url: t.state.url, favicon: t.state.favicon, tabId: t.id }))
    bookmarks.search(text, 4).forEach((b) => push({ kind: 'favori', title: b.title, url: b.url, favicon: b.favicon }))
    history.frecent(text, 6).forEach((h) => push({ kind: 'historique', title: h.title, url: h.url, favicon: h.favicon }))
    if (resolved === search) out.unshift({ kind: 'recherche', title: text, url: search, favicon: null })
    else push({ kind: 'recherche', title: text, url: search, favicon: null })
    return out.slice(0, 10)
  }
}

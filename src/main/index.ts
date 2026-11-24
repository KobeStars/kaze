/**
 * Point d'entrée du processus principal de Kaze.
 */
import { app, BrowserWindow, components, ipcMain, Menu, session } from 'electron'
import { lang, resolveLang, setLang } from '@shared/i18n'
import { join } from 'node:path'
import { BrowserController } from './browser/controller'
import { registerIpc } from './ipc/handlers'
import { registerAppProtocol, registerSchemePrivileges } from './protocol'
import { cleanUserAgent, DEV_SERVER_URL, installGlobalGuards } from './security'
import { BookmarksService } from './services/bookmarks'
import { DownloadsService } from './services/downloads'
import { attachChromeIdentity } from './services/chrome-identity'
import { HistoryService } from './services/history'
import { HomeService } from './services/home'
import { PersoService } from './services/perso'
import { UpdaterService } from './services/updater'
import { StudioService } from './studio/service'
import { PermissionsService } from './services/permissions'
import { SettingsService } from './services/settings'
import { ShieldService } from './services/shield'
import { StormService } from './services/storm'
import { VpnService } from './services/vpn'
import { ResponsiveService } from './services/responsive'
import { ExtensionsService } from './services/extensions'
import { flushAllStores } from './store'
import { createMainWindow } from './window'
import { runAutotest } from './autotest'
import { urlsFromArgs } from './launch-args'

// Les données vont dans %APPDATA%\Kaze, même en développement.
// KAZE_PROFIL permet d'utiliser un autre dossier (tests, profil jetable).
app.setName('Kaze')
app.setPath('userData', process.env['KAZE_PROFIL'] || `${app.getPath('appData')}\\Kaze`)

// Doit être fait avant que l'application soit prête.
registerSchemePrivileges()

let mainWindow: BrowserWindow | null = null
let browserController: BrowserController | null = null
/** Adresses reçues avant que les onglets soient prêts (démarrage, ou seconde instance très tôt). */
const pendingUrls: string[] = urlsFromArgs(process.argv, process.cwd())

function openUrls(urls: string[]): void {
  if (!browserController) {
    pendingUrls.push(...urls)
    return
  }
  for (const url of urls) browserController.createTab({ url })
}

// Une seule instance : relancer Kaze (ou « Ouvrir avec Kaze » sur un fichier) ramène la
// fenêtre existante au premier plan, en ouvrant ce que la nouvelle instance a reçu.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    openUrls(urlsFromArgs(argv, workingDirectory))
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.userAgentFallback = cleanUserAgent(app.userAgentFallback)
  void app.whenReady().then(start)
}

async function start(): Promise<void> {
  app.setAppUserModelId('fr.kordix.kaze')
  // Widevine (Netflix, Spotify, Disney+…) : Electron de castLabs télécharge le module de
  // Google au premier lancement, puis le tient à jour. On l'attend au plus quelques secondes
  // pour ne pas bloquer le démarrage hors ligne ; il reste utilisable dès qu'il arrive.
  const widevine = components.whenReady([]).catch((error: unknown) => console.warn('Widevine indisponible :', error))
  // Pas de menu Electron : Kaze gère lui-même ses raccourcis.
  Menu.setApplicationMenu(null)
  installGlobalGuards()
  // La langue est connue avant tout le reste : menus, pages internes, en-têtes envoyés aux sites.
  const settings = new SettingsService()
  setLang(resolveLang(settings.get().language, app.getLocale()))
  // Lu de façon synchrone par les preloads, avant le premier affichage.
  ipcMain.on('app:lang', (event) => {
    event.returnValue = lang()
  })
  const persoDir = join(app.getPath('userData'), 'perso')
  registerAppProtocol(session.defaultSession, DEV_SERVER_URL, persoDir)

  // Session des onglets : cookies et données des sites, séparés de l'interface.
  const tabSession = session.fromPartition('persist:kaze')
  tabSession.setSpellCheckerLanguages(['fr', 'en-US'])
  registerAppProtocol(tabSession, DEV_SERVER_URL, persoDir)
  // Les sites voient un Google Chrome standard (sinon Google bloque la connexion).
  attachChromeIdentity(tabSession)

  // Extensions Chrome chargées avant les onglets : leurs scripts s'appliquent dès la première page.
  const extensions = new ExtensionsService(tabSession)
  await extensions.init()

  const studio = new StudioService(settings, tabSession, () => 'kaze://app/__perso/')
  await studio.start()
  const services = {
    settings,
    history: new HistoryService(),
    bookmarks: new BookmarksService(),
    downloads: new DownloadsService(settings),
    shield: new ShieldService(settings),
    storm: new StormService(settings),
    vpn: new VpnService(settings, tabSession),
    responsive: new ResponsiveService(settings, tabSession),
    home: new HomeService(),
    studio
  }
  const perso = new PersoService(settings)
  const updater = new UpdaterService(settings)
  const permissions = new PermissionsService()
  permissions.attach(tabSession)
  services.downloads.attach(tabSession)
  void services.shield.attach(tabSession)
  // Brume activée : le proxy Tor est posé avant que les onglets restaurés ne chargent.
  await services.vpn.sync()

  await Promise.race([widevine, new Promise((resolve) => setTimeout(resolve, 5000))])
  mainWindow = createMainWindow()
  const browser = new BrowserController(mainWindow, tabSession, services)
  browserController = browser
  extensions.setTabsProvider(() => browser.extensionTabs())
  openUrls(pendingUrls.splice(0))
  registerIpc(mainWindow, browser, services, permissions, tabSession, perso, updater, extensions)
  // Changement de langue : l'interface et les pages internes se rechargent dans la nouvelle langue.
  settings.on('changed', (s) => {
    const next = resolveLang(s.language, app.getLocale())
    if (next === lang()) return
    setLang(next)
    browser.reloadInterface()
  })

  // Test automatique (développement uniquement, fenêtre invisible).
  const autotest = process.env['KAZE_AUTOTEST']
  if (autotest && !app.isPackaged) void runAutotest(autotest, mainWindow, browser, services)

  mainWindow.on('closed', () => {
    mainWindow = null
    browserController = null
  })
}

// Sous Windows, fermer la fenêtre quitte l'application.
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => flushAllStores())

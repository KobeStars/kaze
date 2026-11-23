/**
 * Types partagés entre le processus principal, les preloads et l'interface.
 * Ce fichier ne contient que des types : il n'ajoute rien aux bundles.
 */
import type { Appearance, SearchEngineId, StudioSettings } from './settings'
import type { Theme, ThemeColors } from './themes'
import type { DeviceId } from './responsive'

/** Rectangle en pixels CSS, relatif au coin haut-gauche de la zone de contenu de la fenêtre. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Thème réellement appliqué (le réglage « système » est résolu par le processus principal). */
export type ResolvedTheme = 'sombre' | 'clair'

export interface WindowState {
  maximized: boolean
  fullscreen: boolean
  focused: boolean
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  userData: string
}

/** Erreur de chargement d'une page (affichée par l'interface à la place de la page). */
export interface PageError {
  code: number
  description: string
  url: string
}

export interface TabState {
  id: number
  workspaceId: string
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  audible: boolean
  muted: boolean
  /** Onglet mis en veille par Brise : sa page est déchargée de la mémoire. */
  asleep: boolean
  /** Requêtes bloquées par le Bouclier de vent depuis le dernier chargement. */
  blockedCount: number
  bookmarked: boolean
  zoom: number
  error: PageError | null
  /** Hôte bloqué par Tempête (mode focus), ou null. */
  stormBlocked: string | null
  createdAt: number
}

/** Un Courant : espace de travail avec ses propres onglets. */
export interface Workspace {
  id: string
  name: string
  color: string
  icon: string
}

/** Web app épinglée dans le panneau latéral. */
export interface PanelApp {
  id: string
  name: string
  url: string
  favicon: string | null
}

export type SplitSide = 'primary' | 'secondary'

export interface SplitState {
  primaryId: number
  secondaryId: number
  focused: SplitSide
}

export interface BrowserState {
  /** Mode clair ou sombre du thème actif. */
  theme: ResolvedTheme
  /** Couleurs du thème actif (déjà résolu selon l'heure ou Windows). */
  palette: ThemeColors
  themeId: string
  workspaces: Workspace[]
  activeWorkspaceId: string
  /** Tous les onglets de tous les Courants, dans l'ordre d'affichage. */
  tabs: TabState[]
  /** Onglet actif du Courant actif. */
  activeTabId: number | null
  split: SplitState | null
  panel: { apps: PanelApp[]; openId: string | null }
  shield: { enabled: boolean; ready: boolean; totalBlocked: number; siteAllowed: boolean }
  storm: { active: boolean; until: number | null }
  vpn: VpnState
  /** Mode responsive : l'onglet affiché sur plusieurs appareils, ou null. */
  responsive: { tabId: number; devices: { id: DeviceId; rotated: boolean }[] } | null
  breeze: { enabled: boolean; sleeping: number }
  /** Une page est en plein écran HTML5 (vidéo…) : l'interface se masque. */
  htmlFullscreen: boolean
  closedTabsCount: number
}

/** Image figée des pages, affichée sous les fenêtres flottantes de l'interface. */
export interface FrozenView {
  rect: Rect
  image: string
}

export interface Bookmark {
  id: string
  url: string
  title: string
  favicon: string | null
  createdAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  favicon: string | null
  lastVisit: number
  visitCount: number
}

export type DownloadStatus = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadEntry {
  id: string
  filename: string
  path: string
  url: string
  status: DownloadStatus
  receivedBytes: number
  totalBytes: number
  startedAt: number
  /** Octets par seconde (mesure lissée), 0 si inconnu. */
  speed: number
}

export type SuggestionKind = 'onglet' | 'favori' | 'historique' | 'recherche' | 'url'

export interface Suggestion {
  kind: SuggestionKind
  title: string
  url: string
  favicon: string | null
  tabId?: number
}

export interface FindResult {
  tabId: number
  activeMatch: number
  matches: number
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

/** Contenu des widgets de la page d'accueil (notes, to-do). */
export interface HomeWidgetsData {
  notes: string
  todos: TodoItem[]
}

/** Données de la page d'accueil (kaze://accueil). */
export interface HomeData {
  theme: ResolvedTheme
  palette: ThemeColors
  userName: string
  engineName: string
  shortcuts: Bookmark[]
  appearance: Appearance
  widgets: HomeWidgetsData
  /** Adresse de base des fichiers perso (polices, images…), ex. kaze://app/__perso/ */
  persoBase: string
}

/** Données de la page de bienvenue (kaze://bienvenue). */
export interface WelcomeData {
  version: string
  userName: string
  themeId: string
  tabPosition: Appearance['tabPosition']
  searchEngine: SearchEngineId
  theme: ResolvedTheme
  palette: ThemeColors
  themes: Theme[]
}

export interface WeatherData {
  city: string
  temperature: number
  code: number
  label: string
  wind: number
  min: number
  max: number
}

export interface DailyImage {
  url: string
  title: string
  credit: string
}

// ───────────── Kaze Studio ─────────────

export interface StudioEntry {
  name: string
  /** Chemin relatif à la racine du projet, avec des « / ». */
  path: string
  dir: boolean
}

export interface StudioState {
  root: string | null
  name: string
  /** Adresse de l'aperçu sur le mini serveur local (http://127.0.0.1:port/jeton/). */
  previewBase: string | null
  settings: StudioSettings
  palette: ThemeColors
  dark: boolean
  appearance: Pick<Appearance, 'fonts' | 'customFonts'>
  persoBase: string
}

export type StudioLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface StudioLog {
  level: StudioLogLevel
  message: string
  /** Fichier du projet (chemin relatif) et position, pour les erreurs cliquables. */
  file?: string
  line?: number
  column?: number
  time: number
}

export type StudioEvent =
  | { type: 'log'; log: StudioLog }
  | { type: 'fs-changed' }
  | { type: 'state'; state: StudioState }
  | { type: 'open-file'; path: string }

/** Commandes que le processus principal demande à l'interface d'exécuter. */
/** Mises à jour automatiques (electron-updater). */
export type UpdateStatus =
  | 'desactive' // version de développement : pas de mise à jour
  | 'attente'
  | 'recherche'
  | 'a-jour'
  | 'telechargement'
  | 'pret' // téléchargée : installée au redémarrage
  | 'erreur'

export interface UpdateState {
  status: UpdateStatus
  /** Version installée. */
  current: string
  /** Version trouvée sur le serveur de mises à jour. */
  available: string | null
  /** Progression du téléchargement, de 0 à 100. */
  progress: number
  error: string | null
  checkedAt: number | null
}

/** Brume (le VPN) : eteint → connexion → actif ; erreur = Tor coupé, les pages restent bloquées. */
export interface VpnState {
  status: 'eteint' | 'connexion' | 'actif' | 'erreur'
  /** Avancement de la connexion au réseau Tor, en %. */
  progress: number
  /** Adresse IP vue par les sites (sortie Tor), quand elle est connue. */
  ip: string | null
  /** Pays du relais de sortie (code ISO en minuscules, ex. « ch »), quand il est connu. */
  country: string | null
  error: string | null
}

/** Une extension Chrome installée dans Kaze. */
export interface ExtensionEntry {
  /** Dossier de l'extension : son identifiant dans Kaze. */
  path: string
  /** Identifiant du Chrome Web Store (null pour un dossier ajouté à la main). */
  storeId: string | null
  name: string
  description: string
  version: string
  /** Icône en adresse data:, ou null. */
  icon: string | null
  enabled: boolean
  /** Chargée par Electron (false si désactivée ou en erreur). */
  loaded: boolean
  /** L'extension a une fenêtre « popup » à son bouton. */
  hasPopup: boolean
  error: string | null
}

export type UiCommand =
  | 'focus-address'
  | 'open-souffle'
  | 'open-history'
  | 'open-bookmarks'
  | 'open-downloads'
  | 'open-settings'
  | 'open-find'
  | 'toggle-sidebar'
  | 'open-storm'
  | 'open-vpn'
  | 'open-workspace-editor'
  | 'play-sound-notif'

/**
 * Paramètres de Kaze : schéma de validation (zod) et valeurs par défaut.
 * Le même schéma sert à valider les mises à jour envoyées par l'interface
 * et à réparer un fichier de paramètres abîmé ou ancien au démarrage.
 */
import { z } from 'zod'
import { TOOLBAR_BUTTON_IDS, VPN_COUNTRIES, WIDGET_IDS } from './constants'
import { DEVICE_IDS, MAX_RESPONSIVE_DEVICES } from './responsive'
import { DEFAULT_SHORTCUTS } from './shortcuts'

export const SEARCH_ENGINE_IDS = ['google', 'duckduckgo', 'brave'] as const
export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number]

const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+$/, 'Nom de domaine invalide')

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
/** Nom de fichier rangé dans le dossier « perso » (aucun chemin). */
const persoFile = z.string().max(200).regex(/^[^\\/:*?"<>|]*$/)

// ───────────── Apparence ─────────────

export const themeColorsSchema = z.object({
  accent: color,
  bg: color,
  chrome: color,
  surface: color,
  text: color,
  muted: color,
  border: color,
  tab: color,
  address: color
})

export const themeSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  dark: z.boolean(),
  colors: themeColorsSchema
})

export const fontSchema = z.object({
  family: z.string().max(120),
  size: z.number().min(9).max(26),
  weight: z.number().int().min(100).max(900),
  lineHeight: z.number().min(1).max(2.4),
  letterSpacing: z.number().min(-0.08).max(0.4)
})
export type FontSettings = z.infer<typeof fontSchema>

/** Police importée (fichier perso ou Google Fonts), une entrée par fichier de police. */
export const customFontSchema = z.object({
  family: z.string().min(1).max(120),
  source: z.enum(['fichier', 'google']),
  faces: z
    .array(
      z.object({
        file: z.string().max(260).regex(/^[a-zA-Z0-9._\-/ ]+$/),
        weight: z.string().max(20),
        style: z.enum(['normal', 'italic']),
        unicodeRange: z.string().max(4000).optional()
      })
    )
    .max(200)
})
export type CustomFont = z.infer<typeof customFontSchema>

export { TOOLBAR_BUTTON_IDS, WIDGET_IDS, type ToolbarButtonId, type WidgetId } from './constants'

export const siteRuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(60),
  /** « exemple.fr », « *.exemple.fr » ou une adresse avec * (https://site.fr/blog/*). */
  match: z.string().trim().min(1).max(300),
  css: z.string().max(200_000),
  js: z.string().max(200_000),
  enabled: z.boolean()
})
export type SiteRule = z.infer<typeof siteRuleSchema>

export const appearanceSchema = z.object({
  /** manuel : un thème fixe ; heure : clair le jour, sombre la nuit ; windows : suit Windows. */
  themeMode: z.enum(['manuel', 'heure', 'windows']),
  themeId: z.string().max(64),
  lightThemeId: z.string().max(64),
  darkThemeId: z.string().max(64),
  dayStart: z.number().int().min(0).max(23),
  nightStart: z.number().int().min(0).max(23),
  customThemes: z.array(themeSchema).max(50),
  accentPerWorkspace: z.boolean(),

  fonts: z.object({
    ui: fontSchema,
    titles: fontSchema,
    code: fontSchema.extend({ ligatures: z.boolean() })
  }),
  customFonts: z.array(customFontSchema).max(60),

  tabPosition: z.enum(['gauche', 'droite', 'haut', 'bas']),
  density: z.enum(['compacte', 'normale', 'aeree']),
  radius: z.number().min(0).max(22),
  blur: z.number().min(0).max(48),
  transparency: z.number().min(0).max(0.6),
  shadows: z.enum(['aucune', 'douces', 'marquees']),
  toolbar: z.array(z.object({ id: z.enum(TOOLBAR_BUTTON_IDS), visible: z.boolean() })).max(TOOLBAR_BUTTON_IDS.length),
  iconSize: z.number().int().min(14).max(24),
  iconStyle: z.enum(['trait', 'plein', 'pinceau']),
  addressBar: z.enum(['centree', 'classique']),

  animations: z.object({
    ink: z.boolean(),
    leaves: z.boolean(),
    splash: z.boolean(),
    loader: z.boolean(),
    speed: z.number().min(0.25).max(3),
    reduced: z.boolean()
  }),

  home: z.object({
    background: z.enum(['paysage', 'image', 'video', 'couleur', 'degrade', 'jour', 'galerie']),
    /** Fond choisi dans la galerie (identifiant, voir shared/wallpapers.ts). Ajouté en 0.2.13 :
     *  la valeur par défaut évite de remettre à zéro l'accueil des anciens réglages. */
    wallpaper: z.string().max(40).default('fuji'),
    image: persoFile,
    video: persoFile,
    color,
    gradient: z.tuple([color, color]),
    gradientAngle: z.number().int().min(0).max(360),
    dim: z.number().min(0).max(0.8),
    widgets: z
      .array(
        z.object({
          id: z.enum(WIDGET_IDS),
          visible: z.boolean(),
          /** Position du centre du widget, en % de la page. */
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100)
        })
      )
      .max(WIDGET_IDS.length),
    shortcutsCount: z.number().int().min(0).max(24),
    shortcutsSize: z.enum(['petit', 'moyen', 'grand']),
    searchStyle: z.enum(['verre', 'plein', 'contour', 'souligne']),
    weatherCity: z.string().max(80)
  }),

  customCss: z.string().max(200_000),
  siteRules: z.array(siteRuleSchema).max(200),
  cursor: z.enum(['systeme', 'pinceau', 'point', 'perso']),
  cursorFile: persoFile,
  sounds: z.object({
    enabled: z.boolean(),
    pack: z.enum(['bambou', 'cloche', 'goutte', 'minimal']),
    volume: z.number().min(0).max(1)
  })
})
export type Appearance = z.infer<typeof appearanceSchema>

// ───────────── Kaze Studio ─────────────

export const snippetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  language: z.enum(['html', 'css', 'javascript', 'json']),
  body: z.string().max(50_000)
})
export type Snippet = z.infer<typeof snippetSchema>

export const studioSettingsSchema = z.object({
  /** direct : l'aperçu suit la frappe ; sauvegarde : il se met à jour à chaque Ctrl+S. */
  previewMode: z.enum(['direct', 'sauvegarde']),
  delay: z.number().int().min(100).max(5000),
  layout: z.enum(['droite', 'bas', 'fenetre']),
  editorTheme: z.enum(['auto', 'encre', 'washi', 'vs-dark', 'vs', 'hc-black']),
  minimap: z.boolean(),
  wordWrap: z.boolean(),
  formatOnSave: z.boolean(),
  splitRatio: z.number().min(0.2).max(0.8),
  snippets: z.array(snippetSchema).max(300),
  recent: z.array(z.string().max(1024)).max(10)
})
export type StudioSettings = z.infer<typeof studioSettingsSchema>

// ───────────── Paramètres complets ─────────────

export const settingsSchema = z.object({
  searchEngine: z.enum(SEARCH_ENGINE_IDS),
  homepage: z.object({
    mode: z.enum(['kaze', 'url']),
    url: z.string().max(2048)
  }),
  startup: z.enum(['restaurer', 'accueil']),
  sidebarCollapsed: z.boolean(),
  sidebarWidth: z.number().int().min(180).max(420),
  userName: z.string().max(40),
  downloadDir: z.string().max(1024),
  shield: z.object({
    enabled: z.boolean(),
    allowlist: z.array(hostSchema).max(500)
  }),
  breeze: z.object({
    enabled: z.boolean(),
    minutes: z.number().int().min(1).max(480)
  }),
  /** Brume : le VPN de Kaze (réseau Tor). */
  vpn: z.object({
    enabled: z.boolean(),
    country: z.enum(VPN_COUNTRIES)
  }),
  storm: z.object({
    sites: z.array(hostSchema).max(200),
    defaultMinutes: z.number().int().min(5).max(480)
  }),
  splitRatio: z.number().min(0.2).max(0.8),
  panelWidth: z.number().int().min(280).max(800),
  shortcuts: z.record(z.string().max(40), z.string().max(40)),
  appearance: appearanceSchema,
  studio: studioSettingsSchema,
  /** Appareils du mode responsive, dans l'ordre d'affichage. */
  responsiveDevices: z.array(z.object({ id: z.enum(DEVICE_IDS), rotated: z.boolean() })).min(1).max(MAX_RESPONSIVE_DEVICES),
  /** Rechercher et télécharger les mises à jour automatiquement. */
  autoUpdate: z.boolean(),
  /** La page de bienvenue a déjà été montrée. */
  welcomeSeen: z.boolean()
})

export type Settings = z.infer<typeof settingsSchema>

/** Mise à jour partielle : chaque clé fournie remplace entièrement l'ancienne valeur. */
export const settingsPatchSchema = settingsSchema.partial().strict()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const DEFAULT_STORM_SITES = [
  'youtube.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'twitch.tv',
  'netflix.com'
]

export const DEFAULT_APPEARANCE: Appearance = {
  themeMode: 'manuel',
  themeId: 'encre',
  lightThemeId: 'washi',
  darkThemeId: 'encre',
  dayStart: 7,
  nightStart: 19,
  customThemes: [],
  accentPerWorkspace: false,
  fonts: {
    ui: { family: 'Inter Variable', size: 13, weight: 400, lineHeight: 1.4, letterSpacing: 0 },
    titles: { family: 'Shippori Mincho', size: 24, weight: 700, lineHeight: 1.2, letterSpacing: 0 },
    code: { family: 'JetBrains Mono Variable', size: 13, weight: 400, lineHeight: 1.6, letterSpacing: 0, ligatures: true }
  },
  customFonts: [],
  tabPosition: 'gauche',
  density: 'normale',
  radius: 10,
  blur: 28,
  transparency: 0.28,
  shadows: 'douces',
  toolbar: [
    { id: 'back', visible: true },
    { id: 'forward', visible: true },
    { id: 'reload', visible: true },
    { id: 'home', visible: true },
    { id: 'shield', visible: true },
    { id: 'vpn', visible: true },
    { id: 'split', visible: true },
    { id: 'storm', visible: true },
    { id: 'downloads', visible: true },
    { id: 'studio', visible: true },
    { id: 'responsive', visible: true },
    { id: 'extensions', visible: true },
    { id: 'souffle', visible: true },
    { id: 'breeze', visible: false },
    { id: 'history', visible: false },
    { id: 'bookmarks', visible: false }
  ],
  iconSize: 18,
  iconStyle: 'trait',
  addressBar: 'centree',
  animations: { ink: true, leaves: true, splash: true, loader: true, speed: 1, reduced: false },
  home: {
    background: 'paysage',
    wallpaper: 'fuji',
    image: '',
    video: '',
    color: '#111111',
    gradient: ['#1B1F3B', '#D7372A'],
    gradientAngle: 160,
    dim: 0.25,
    widgets: [
      { id: 'horloge', visible: true, x: 50, y: 24 },
      { id: 'raccourcis', visible: true, x: 50, y: 66 },
      { id: 'meteo', visible: false, x: 12, y: 10 },
      { id: 'citation', visible: true, x: 50, y: 88 },
      { id: 'notes', visible: false, x: 85, y: 30 },
      { id: 'todo', visible: false, x: 15, y: 40 }
    ],
    shortcutsCount: 12,
    shortcutsSize: 'moyen',
    searchStyle: 'verre',
    weatherCity: 'Paris'
  },
  customCss: '',
  siteRules: [],
  cursor: 'systeme',
  cursorFile: '',
  sounds: { enabled: false, pack: 'bambou', volume: 0.5 }
}

export const DEFAULT_STUDIO: StudioSettings = {
  previewMode: 'direct',
  delay: 400,
  layout: 'droite',
  editorTheme: 'auto',
  minimap: true,
  wordWrap: false,
  formatOnSave: false,
  splitRatio: 0.5,
  snippets: [],
  recent: []
}

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'google',
  homepage: { mode: 'kaze', url: '' },
  startup: 'restaurer',
  sidebarCollapsed: false,
  sidebarWidth: 248,
  userName: '',
  downloadDir: '',
  shield: { enabled: true, allowlist: [] },
  breeze: { enabled: true, minutes: 20 },
  vpn: { enabled: false, country: 'auto' },
  storm: { sites: DEFAULT_STORM_SITES, defaultMinutes: 25 },
  splitRatio: 0.5,
  panelWidth: 400,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  appearance: DEFAULT_APPEARANCE,
  studio: DEFAULT_STUDIO,
  responsiveDevices: [
    { id: 'iphone-15', rotated: false },
    { id: 'ipad-air', rotated: false },
    { id: 'laptop', rotated: false }
  ],
  autoUpdate: true,
  welcomeSeen: false
}

/** Répare un objet clé par clé : chaque valeur invalide reprend sa valeur par défaut. */
function repairObject<T extends Record<string, unknown>>(shape: Record<string, z.ZodType>, raw: unknown, defaults: T): T {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(shape)) {
    const parsed = shape[key]!.safeParse(source[key])
    result[key] = parsed.success ? parsed.data : structuredClone(defaults[key])
  }
  return result as T
}

/**
 * Fusionne des paramètres lus sur le disque avec les valeurs par défaut :
 * chaque clé invalide ou absente reprend sa valeur par défaut, sans perdre les autres.
 * L'apparence et Studio sont réparés champ par champ (ajout de réglages dans une mise à jour).
 */
export function repairSettings(raw: unknown): Settings {
  const settings = repairObject(settingsSchema.shape, raw, DEFAULT_SETTINGS)
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  settings.appearance = repairObject(appearanceSchema.shape, source['appearance'], DEFAULT_APPEARANCE)
  settings.studio = repairObject(studioSettingsSchema.shape, source['studio'], DEFAULT_STUDIO)

  // Migration depuis la première version (thème « sombre / clair / système »).
  const ancien = source['theme']
  if (!source['appearance'] && (ancien === 'clair' || ancien === 'systeme')) {
    settings.appearance.themeMode = ancien === 'clair' ? 'manuel' : 'windows'
    settings.appearance.themeId = ancien === 'clair' ? 'washi' : 'encre'
  }
  if (!source['appearance'] && source['tabLayout'] === 'horizontal') settings.appearance.tabPosition = 'haut'
  if (!source['appearance'] && source['splash'] === false) settings.appearance.animations.splash = false

  // La barre d'outils contient toujours tous les boutons : un bouton ajouté par une mise à jour
  // se place après son voisin par défaut, visible ou non comme dans la configuration par défaut.
  const toolbar = settings.appearance.toolbar
  DEFAULT_APPEARANCE.toolbar.forEach((button, index) => {
    if (toolbar.some((b) => b.id === button.id)) return
    const previous = DEFAULT_APPEARANCE.toolbar[index - 1]
    const at = previous ? toolbar.findIndex((b) => b.id === previous.id) : -1
    toolbar.splice(at >= 0 ? at + 1 : toolbar.length, 0, { ...button })
  })
  const knownWidgets = new Set(settings.appearance.home.widgets.map((w) => w.id))
  for (const widget of DEFAULT_APPEARANCE.home.widgets) if (!knownWidgets.has(widget.id)) settings.appearance.home.widgets.push({ ...widget })

  // Les nouvelles actions ajoutées dans une mise à jour reçoivent leur raccourci par défaut.
  settings.shortcuts = { ...DEFAULT_SHORTCUTS, ...settings.shortcuts }
  return settings
}

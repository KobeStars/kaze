/**
 * Contrat IPC de Kaze : la liste exhaustive des messages autorisés entre processus.
 *
 * - `invokeSchemas`   : interface → principal, avec réponse (ipcRenderer.invoke)
 * - `sendSchemas`     : interface → principal, sans réponse (messages fréquents)
 * - `internalSchemas` : pages internes kaze:// (accueil) → principal
 * - `EventPayloads`   : principal → interface / pages internes
 *
 * Chaque argument reçu par le processus principal est validé avec zod avant usage :
 * l'interface est considérée comme non fiable (une faille XSS ne doit pas suffire à
 * piloter le navigateur avec des données arbitraires).
 */
import { z } from 'zod'
import { VPN_COUNTRIES } from './constants'
import { appearanceSchema, SEARCH_ENGINE_IDS, settingsPatchSchema, studioSettingsSchema } from './settings'
import type {
  ExtensionEntry,
  AppInfo,
  Bookmark,
  BrowserState,
  DownloadEntry,
  FindResult,
  DailyImage,
  FrozenView,
  HistoryEntry,
  HomeData,
  StudioEntry,
  StudioEvent,
  StudioState,
  Suggestion,
  WeatherData,
  UiCommand,
  UpdateState,
  WelcomeData,
  WindowState
} from './types'
import type { Settings } from './settings'
import { t } from './i18n'

const tabId = z.number().int().nonnegative()
const id = z.string().min(1).max(64)
const text = z.string().max(8192)
const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0)
})
/** Chemin relatif dans un projet Studio : pas de lecteur, pas de « .. ». */
const relPath = z
  .string()
  .max(1024)
  .refine((p) => !/^[a-zA-Z]:|^[\/]/.test(p) && !p.split(/[\/]/).includes('..'), 'Chemin interdit')
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((n) => !/[\/:*?"<>|]/.test(n) && n !== '.' && n !== '..', { error: () => t('Nom de fichier invalide') })
const extPath = z.string().min(3).max(1024)

const workspaceFields = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(4)
})

export const invokeSchemas = {
  'window:minimize': z.tuple([]),
  'window:toggle-maximize': z.tuple([]),
  'window:close': z.tuple([]),
  'window:get-state': z.tuple([]),
  'window:toggle-fullscreen': z.tuple([]),
  'app:get-info': z.tuple([]),
  'app:open-external': z.tuple([z.enum(['dossier-donnees'])]),

  'browser:get-state': z.tuple([]),
  'tab:create': z.tuple([z.object({ input: text.optional(), background: z.boolean().optional() })]),
  'tab:close': z.tuple([tabId]),
  'tab:activate': z.tuple([tabId]),
  'tab:navigate': z.tuple([tabId, text]),
  'tab:go': z.tuple([tabId, z.enum(['back', 'forward', 'reload', 'hard-reload', 'stop', 'home'])]),
  'tab:move': z.tuple([tabId, z.number().int().nonnegative()]),
  'tab:mute': z.tuple([tabId]),
  'tab:reopen-closed': z.tuple([]),
  'tab:menu': z.tuple([tabId]),
  'tab:zoom': z.tuple([tabId, z.enum(['in', 'out', 'reset'])]),
  'tab:find': z.tuple([tabId, z.string().min(1).max(500), z.object({ forward: z.boolean(), findNext: z.boolean() })]),
  'tab:find-stop': z.tuple([tabId]),
  'tab:sleep': z.tuple([tabId]),
  'tab:devtools': z.tuple([tabId]),

  'view:freeze': z.tuple([]),
  'view:unfreeze': z.tuple([]),

  'workspace:create': z.tuple([workspaceFields]),
  'workspace:update': z.tuple([id, workspaceFields.partial()]),
  'workspace:delete': z.tuple([id]),
  'workspace:activate': z.tuple([id]),
  'workspace:move-tab': z.tuple([tabId, id]),

  'split:open': z.tuple([tabId]),
  'split:close': z.tuple([]),
  'split:focus': z.tuple([z.enum(['primary', 'secondary'])]),
  'split:swap': z.tuple([]),

  'panel:open': z.tuple([id.nullable()]),
  'panel:add': z.tuple([z.object({ name: z.string().trim().min(1).max(40), url: text })]),
  'panel:remove': z.tuple([id]),

  'bookmarks:list': z.tuple([]),
  'bookmarks:add': z.tuple([z.object({ url: text, title: z.string().max(500) })]),
  'bookmarks:update': z.tuple([id, z.object({ url: text, title: z.string().max(500) })]),
  'bookmarks:remove': z.tuple([id]),
  'bookmarks:toggle-tab': z.tuple([tabId]),

  'history:search': z.tuple([z.string().max(500), z.number().int().min(1).max(2000)]),
  'history:remove': z.tuple([id]),
  'history:clear': z.tuple([z.enum(['heure', 'jour', 'tout'])]),

  'downloads:list': z.tuple([]),
  'downloads:action': z.tuple([id, z.enum(['pause', 'resume', 'cancel', 'open', 'show', 'remove'])]),
  'downloads:clear': z.tuple([]),

  'settings:get': z.tuple([]),
  'settings:set': z.tuple([settingsPatchSchema]),
  'settings:choose-download-dir': z.tuple([]),
  'settings:reset-shortcuts': z.tuple([]),
  'shortcuts:suspend': z.tuple([z.boolean()]),

  'shield:toggle-site': z.tuple([tabId]),
  'storm:start': z.tuple([z.number().int().min(1).max(480)]),
  'storm:stop': z.tuple([]),
  'vpn:set': z.tuple([z.boolean()]),
  'vpn:country': z.tuple([z.enum(VPN_COUNTRIES)]),
  'vpn:reconnect': z.tuple([]),
  /** Lance le mode responsive sur un onglet, ou l'arrête (null). */
  'responsive:toggle': z.tuple([tabId.nullable()]),

  // Extensions Chrome (identifiées par leur dossier)
  'ext:list': z.tuple([]),
  'ext:install': z.tuple([z.string().trim().min(10).max(500)]),
  'ext:install-folder': z.tuple([]),
  'ext:remove': z.tuple([extPath]),
  'ext:toggle': z.tuple([extPath, z.boolean()]),
  'ext:popup': z.tuple([extPath, rect]),
  'suggest:query': z.tuple([z.string().max(500)]),
  'data:clear-browsing': z.tuple([]),

  // Personnalisation
  'perso:import': z.tuple([z.enum(['police', 'image', 'video', 'curseur'])]),
  'perso:google-font': z.tuple([z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9 ]+$/)]),
  'perso:remove-font': z.tuple([z.string().max(120)]),
  'theme:export': z.tuple([]),
  'theme:import': z.tuple([]),
  'settings:reset': z.tuple([z.enum(['tout', 'apparence', 'theme', 'polices', 'interface', 'animations', 'accueil', 'avance', 'studio'])]),

  // Kaze Studio
  'studio:open': z.tuple([]),
  'studio:open-page': z.tuple([tabId]),

  // Mises à jour
  'update:get': z.tuple([]),
  'update:check': z.tuple([]),
  'update:install': z.tuple([])
} as const

export interface InvokeResults {
  'window:minimize': void
  'window:toggle-maximize': void
  'window:close': void
  'window:get-state': WindowState
  'window:toggle-fullscreen': void
  'app:get-info': AppInfo
  'app:open-external': void
  'browser:get-state': BrowserState
  'tab:create': number
  'tab:close': void
  'tab:activate': void
  'tab:navigate': void
  'tab:go': void
  'tab:move': void
  'tab:mute': void
  'tab:reopen-closed': void
  'tab:menu': void
  'tab:zoom': void
  'tab:find': void
  'tab:find-stop': void
  'tab:sleep': void
  'tab:devtools': void
  'view:freeze': FrozenView[]
  'view:unfreeze': void
  'workspace:create': string
  'workspace:update': void
  'workspace:delete': void
  'workspace:activate': void
  'workspace:move-tab': void
  'split:open': void
  'split:close': void
  'split:focus': void
  'split:swap': void
  'panel:open': void
  'panel:add': void
  'panel:remove': void
  'bookmarks:list': Bookmark[]
  'bookmarks:add': void
  'bookmarks:update': void
  'bookmarks:remove': void
  'bookmarks:toggle-tab': void
  'history:search': HistoryEntry[]
  'history:remove': void
  'history:clear': void
  'downloads:list': DownloadEntry[]
  'downloads:action': void
  'downloads:clear': void
  'settings:get': Settings
  'settings:set': Settings
  'settings:choose-download-dir': string | null
  'settings:reset-shortcuts': Settings
  'shortcuts:suspend': void
  'shield:toggle-site': void
  'storm:start': void
  'storm:stop': void
  'vpn:set': void
  'vpn:country': void
  'vpn:reconnect': void
  'responsive:toggle': void
  'ext:list': ExtensionEntry[]
  'ext:install': ExtensionEntry
  'ext:install-folder': ExtensionEntry | null
  'ext:remove': void
  'ext:toggle': void
  'ext:popup': void
  'suggest:query': Suggestion[]
  'data:clear-browsing': void
  'perso:import': { file: string; family?: string } | null
  'perso:google-font': string
  'perso:remove-font': void
  'theme:export': boolean
  'theme:import': boolean
  'settings:reset': Settings
  'studio:open': void
  'studio:open-page': void
  'update:get': UpdateState
  'update:check': void
  'update:install': void
}

/** Messages sans réponse, envoyés souvent (position des pages dans la fenêtre). */
export const sendSchemas = {
  'layout:viewport': z.tuple([
    z.object({
      primary: rect.nullable(),
      secondary: rect.nullable(),
      panel: rect.nullable(),
      /** Emplacements des appareils du mode responsive, dans l'ordre des appareils. */
      responsive: z.array(rect.nullable()).max(4)
    })
  ])
} as const

/** Canaux réservés aux pages internes kaze:// chargées dans un onglet. */
export const internalSchemas = {
  'interne:get-home': z.tuple([]),
  'interne:navigate': z.tuple([text]),
  'interne:save-notes': z.tuple([z.string().max(100_000)]),
  'interne:save-todos': z.tuple([
    z.array(z.object({ id: z.string().min(1).max(64), text: z.string().max(500), done: z.boolean() })).max(200)
  ]),
  'interne:save-layout': z.tuple([appearanceSchema.shape.home.shape.widgets]),
  'interne:weather': z.tuple([]),
  'interne:daily-image': z.tuple([]),

  // Page de bienvenue (kaze://bienvenue)
  'bienvenue:get': z.tuple([]),
  'bienvenue:set': z.tuple([
    z
      .object({
        userName: z.string().max(40).optional(),
        themeId: z.string().min(1).max(64).optional(),
        tabPosition: z.enum(['gauche', 'droite', 'haut', 'bas']).optional(),
        searchEngine: z.enum(SEARCH_ENGINE_IDS).optional()
      })
      .strict()
  ]),
  'bienvenue:done': z.tuple([])
} as const

export interface InternalResults {
  'interne:get-home': HomeData
  'interne:navigate': void
  'interne:save-notes': void
  'interne:save-todos': void
  'interne:save-layout': void
  'interne:weather': WeatherData | null
  'interne:daily-image': DailyImage | null
  'bienvenue:get': WelcomeData
  'bienvenue:set': WelcomeData
  'bienvenue:done': void
}

/** Canaux réservés à Kaze Studio (kaze://studio). */
export const studioSchemas = {
  'studio:get-state': z.tuple([]),
  'studio:open-folder': z.tuple([]),
  'studio:open-file': z.tuple([]),
  'studio:open-recent': z.tuple([z.string().max(1024)]),
  'studio:new-project': z.tuple([fileName]),
  'studio:list': z.tuple([relPath]),
  'studio:read': z.tuple([relPath]),
  'studio:write': z.tuple([relPath, z.string().max(20_000_000)]),
  'studio:create': z.tuple([relPath, fileName, z.enum(['fichier', 'dossier'])]),
  'studio:rename': z.tuple([relPath, fileName]),
  'studio:move': z.tuple([relPath, relPath]),
  'studio:delete': z.tuple([relPath]),
  'studio:overlay': z.tuple([relPath, z.string().max(20_000_000).nullable()]),
  'studio:refresh': z.tuple([z.enum(['reload', 'css']), relPath.optional()]),
  'studio:export-zip': z.tuple([]),
  'studio:preview-window': z.tuple([relPath]),
  'studio:settings': z.tuple([studioSettingsSchema.partial().strict()])
} as const

export interface StudioResults {
  'studio:get-state': StudioState
  'studio:open-folder': StudioState
  'studio:open-file': { state: StudioState; file: string } | null
  'studio:open-recent': StudioState
  'studio:new-project': StudioState
  'studio:list': StudioEntry[]
  'studio:read': string
  'studio:write': void
  'studio:create': string
  'studio:rename': string
  'studio:move': string
  'studio:delete': void
  'studio:overlay': void
  'studio:refresh': void
  'studio:export-zip': boolean
  'studio:preview-window': void
  'studio:settings': StudioState
}

export interface EventPayloads {
  'window:state': WindowState
  'browser:state': BrowserState
  'settings:changed': Settings
  'bookmarks:changed': Bookmark[]
  'downloads:changed': DownloadEntry[]
  'history:changed': null
  'ui:command': UiCommand
  'find:result': FindResult
  'interne:home-changed': HomeData
  'studio:event': StudioEvent
  'update:state': UpdateState
  'ext:changed': ExtensionEntry[]
}

export type InvokeChannel = keyof typeof invokeSchemas
export type InvokeArgs<C extends InvokeChannel> = z.infer<(typeof invokeSchemas)[C]>
export type SendChannel = keyof typeof sendSchemas
export type SendArgs<C extends SendChannel> = z.infer<(typeof sendSchemas)[C]>
export type InternalChannel = keyof typeof internalSchemas
export type InternalArgs<C extends InternalChannel> = z.infer<(typeof internalSchemas)[C]>
export type StudioChannel = keyof typeof studioSchemas
export type StudioArgs<C extends StudioChannel> = z.infer<(typeof studioSchemas)[C]>
export type EventChannel = keyof EventPayloads

/** Garde-fou à la compilation : chaque canal invoke a bien un type de réponse, et inversement. */
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : false
export type ContractCheck = [
  SameKeys<InvokeResults, typeof invokeSchemas>,
  SameKeys<InternalResults, typeof internalSchemas>,
  SameKeys<StudioResults, typeof studioSchemas>
] extends [true, true, true]
  ? true
  : never
export const contractIsComplete: ContractCheck = true

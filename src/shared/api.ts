/**
 * Forme des API exposées par les preloads (window.kaze et window.kazeInterne).
 * Les deux preloads implémentent ces interfaces ; l'interface React les consomme.
 */
import type { Lang } from './i18n'
import type { InvokeArgs, InvokeChannel, InvokeResults, SendArgs, SendChannel, EventChannel, EventPayloads } from './ipc'
import type { StudioArgs, StudioChannel, StudioResults } from './ipc'
import type { DailyImage, HomeData, StudioEvent, TodoItem, WeatherData, WelcomeData } from './types'
import type { Appearance } from './settings'

export type Unsubscribe = () => void

/** API de l'interface du navigateur (kaze://app). */
export interface KazeApi {
  /** Langue de l'interface, lue au chargement (l'interface se recharge si elle change). */
  readonly lang: Lang
  /** Appelle un canal du contrat IPC ; les arguments sont revalidés côté principal. */
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResults[C]>
  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayloads[C]) => void): Unsubscribe
}

/** API de la page d'accueil (kaze://accueil). */
export interface KazeInterneApi {
  getHome(): Promise<HomeData>
  navigate(input: string): Promise<void>
  saveNotes(text: string): Promise<void>
  saveTodos(todos: TodoItem[]): Promise<void>
  saveLayout(widgets: Appearance['home']['widgets']): Promise<void>
  weather(): Promise<WeatherData | null>
  dailyImage(): Promise<DailyImage | null>
  onHomeChanged(listener: (data: HomeData) => void): Unsubscribe
}

/** API de Kaze Studio (kaze://studio). */
export interface KazeStudioApi {
  invoke<C extends StudioChannel>(channel: C, ...args: StudioArgs<C>): Promise<StudioResults[C]>
  onEvent(listener: (event: StudioEvent) => void): Unsubscribe
}

/** API de la page de bienvenue (kaze://bienvenue). */
export interface KazeBienvenueApi {
  get(): Promise<WelcomeData>
  set(patch: { userName?: string; themeId?: string; tabPosition?: WelcomeData['tabPosition']; searchEngine?: WelcomeData['searchEngine'] }): Promise<WelcomeData>
  done(): Promise<void>
}

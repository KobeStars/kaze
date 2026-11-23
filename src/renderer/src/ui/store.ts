/**
 * État de l'interface : petits « stores » alimentés par les évènements du processus
 * principal, lus dans React avec useSyncExternalStore (pas de bibliothèque d'état).
 */
import { useSyncExternalStore } from 'react'
import type { Appearance, Settings, SettingsPatch } from '@shared/settings'
import type { Bookmark, BrowserState, DownloadEntry, ExtensionEntry, FrozenView, TabState, UpdateState, WindowState } from '@shared/types'

export const kaze = window.kaze

export interface Store<T> {
  get(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}

export const browserStore = createStore<BrowserState | null>(null)
export const settingsStore = createStore<Settings | null>(null)
export const windowStore = createStore<WindowState>({ maximized: false, fullscreen: false, focused: true })
export const bookmarksStore = createStore<Bookmark[]>([])
export const downloadsStore = createStore<DownloadEntry[]>([])
/** Incrémenté quand l'historique change (les panneaux ouverts se rafraîchissent). */
export const historyVersion = createStore(0)
export const updateStore = createStore<UpdateState | null>(null)
export const extensionsStore = createStore<ExtensionEntry[]>([])

/** Branche les stores sur le processus principal (appelé une fois au démarrage). */
export function connectStores(): void {
  kaze.on('browser:state', (s) => browserStore.set(s))
  // Pendant un réglage en cours (curseur qu'on fait glisser), la valeur locale fait foi.
  kaze.on('settings:changed', (s) => {
    if (!pending) settingsStore.set(s)
  })
  kaze.on('window:state', (s) => windowStore.set(s))
  kaze.on('bookmarks:changed', (b) => bookmarksStore.set(b))
  kaze.on('downloads:changed', (d) => downloadsStore.set(d))
  kaze.on('history:changed', () => historyVersion.set(historyVersion.get() + 1))
  void kaze.invoke('browser:get-state').then((s) => browserStore.set(s))
  void kaze.invoke('settings:get').then((s) => settingsStore.set(s))
  void kaze.invoke('window:get-state').then((s) => windowStore.set(s))
  void kaze.invoke('bookmarks:list').then((b) => bookmarksStore.set(b))
  void kaze.invoke('downloads:list').then((d) => downloadsStore.set(d))
  kaze.on('update:state', (u) => updateStore.set(u))
  void kaze.invoke('update:get').then((u) => updateStore.set(u))
  kaze.on('ext:changed', (list) => extensionsStore.set(list))
  void kaze.invoke('ext:list').then((list) => extensionsStore.set(list))
}

export function activeTab(state: BrowserState): TabState | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId)
}

// ───────────── Figer les pages sous les fenêtres flottantes ─────────────

/**
 * Les pages (WebContentsView) passent toujours au-dessus de l'interface. Pour afficher
 * une fenêtre flottante par-dessus, on demande au principal une capture des pages puis
 * leur retrait ; l'interface affiche la capture à leur place. Plusieurs fenêtres
 * peuvent demander le gel en même temps : on compte les demandes.
 */
export const frozenStore = createStore<FrozenView[]>([])
let freezeCount = 0

export function acquireFreeze(): () => void {
  freezeCount++
  if (freezeCount === 1) {
    void kaze.invoke('view:freeze').then((shots) => {
      if (freezeCount > 0) frozenStore.set(shots)
    })
  }
  let released = false
  return () => {
    if (released) return
    released = true
    freezeCount--
    if (freezeCount === 0) {
      frozenStore.set([])
      void kaze.invoke('view:unfreeze')
    }
  }
}

// ───────────── Modifier les paramètres ─────────────

let pending: SettingsPatch | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Met à jour les paramètres : l'interface est modifiée tout de suite (aperçu instantané),
 * l'envoi au processus principal est regroupé (un curseur qu'on fait glisser n'envoie pas
 * cinquante messages par seconde).
 */
export function updateSettings(patch: SettingsPatch): void {
  const current = settingsStore.get()
  if (!current) return
  settingsStore.set({ ...current, ...patch } as Settings)
  pending = { ...pending, ...patch }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const send = pending
    pending = null
    if (send) void kaze.invoke('settings:set', send)
  }, 90)
}

export function setAppearance(patch: Partial<Appearance>): void {
  const current = settingsStore.get()
  if (current) updateSettings({ appearance: { ...current.appearance, ...patch } })
}

/**
 * Couche de compatibilité des extensions Chrome, exécutée avant leur code (moteur
 * d'arrière-plan « service worker » et pages de l'extension : popup, options…).
 *
 * Electron n'implémente qu'une partie des API Chrome : une extension qui appelle une
 * fonction absente plante dès le démarrage. On ajoute ici les plus courantes, sous une
 * forme sûre (réponse neutre, évènements qui ne se déclenchent pas), sans jamais remplacer
 * une fonction qu'Electron fournit déjà. Rien n'est exposé aux sites web : le script ne fait
 * rien hors des adresses chrome-extension://.
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Onglets de Kaze, demandés au processus principal (voir services/extensions.ts). */
interface TabsBridge {
  list: () => Promise<Record<string, unknown>[]>
}

function kazeCompat(bridge: TabsBridge): void {
  if (typeof location === 'undefined' || location.protocol !== 'chrome-extension:') return
  const c = (globalThis as unknown as { chrome?: Record<string, Record<string, unknown>> }).chrome
  if (!c) return
  type Listener = (...args: unknown[]) => void
  const event = (): Record<string, unknown> => {
    const listeners = new Set<Listener>()
    return {
      addListener: (f: Listener) => listeners.add(f),
      removeListener: (f: Listener) => listeners.delete(f),
      hasListener: (f: Listener) => listeners.has(f),
      hasListeners: () => listeners.size > 0
    }
  }
  /** Fonction qui répond `value` à la fois par rappel (style Chrome) et par promesse. */
  const done =
    (value?: unknown) =>
    (...args: unknown[]): Promise<unknown> => {
      const callback = args.find((a): a is Listener => typeof a === 'function')
      if (callback) {
        try {
          callback(value)
        } catch {
          // l'erreur appartient à l'extension
        }
      }
      return Promise.resolve(value)
    }
  const fill = (namespace: string, members: Record<string, unknown>): void => {
    const target = (c[namespace] ??= {})
    for (const [key, value] of Object.entries(members)) if (target[key] === undefined) target[key] = value
  }
  const window = { id: 1, focused: true, type: 'normal', state: 'normal', incognito: false }

  fill('extension', { isAllowedFileSchemeAccess: done(false), isAllowedIncognitoAccess: done(false), inIncognitoContext: false })
  const action = {
    setIcon: done(),
    setBadgeText: done(),
    getBadgeText: done(''),
    setBadgeBackgroundColor: done(),
    getBadgeBackgroundColor: done([0, 0, 0, 0]),
    setBadgeTextColor: done(),
    setTitle: done(),
    getTitle: done(''),
    setPopup: done(),
    getPopup: done(''),
    enable: done(),
    disable: done(),
    isEnabled: done(true),
    getUserSettings: done({ isOnToolbar: true }),
    onClicked: event()
  }
  fill('action', action)
  fill('browserAction', action)
  fill('contextMenus', {
    create: (props: { id?: string } | undefined, callback?: Listener) => {
      callback?.()
      return props?.id ?? 1
    },
    update: done(),
    remove: done(),
    removeAll: done(),
    onClicked: event()
  })
  fill('commands', { getAll: done([]), onCommand: event() })
  fill('alarms', { create: done(), get: done(undefined), getAll: done([]), clear: done(false), clearAll: done(false), onAlarm: event() })
  fill('notifications', { create: done(''), update: done(false), clear: done(false), getAll: done({}), onClicked: event(), onClosed: event(), onButtonClicked: event() })
  fill('permissions', { contains: done(true), request: done(true), getAll: done({ permissions: [], origins: ['<all_urls>'] }), remove: done(false), onAdded: event(), onRemoved: event() })
  fill('windows', {
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,
    get: done(window),
    getAll: done([window]),
    getCurrent: done(window),
    getLastFocused: done(window),
    onFocusChanged: event(),
    onCreated: event(),
    onRemoved: event()
  })
  fill('tabs', { onActivated: event(), onCreated: event(), onRemoved: event(), onUpdated: event(), onReplaced: event(), onHighlighted: event() })
  fill('runtime', { onStartup: event(), onInstalled: event(), getPlatformInfo: done({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' }) })
  fill('idle', { queryState: done('active'), setDetectionInterval: () => undefined, onStateChanged: event() })
  // chrome.storage.sync / session absents : on se rabat sur le stockage local (même interface).
  const storage = c['storage'] as Record<string, unknown> | undefined
  if (storage?.['local']) {
    storage['sync'] ??= storage['local']
    storage['session'] ??= storage['local']
  }

  // chrome.tabs.query / get : les vrais onglets de Kaze, avec l'onglet affiché comme onglet actif.
  // Les identifiants sont ceux d'Electron : tabs.sendMessage, executeScript… restent valables.
  // Electron ne connaît pas l'onglet affiché : pour lui, l'onglet « actif » est la fenêtre qui a
  // le focus, souvent la popup de l'extension elle-même.
  const tabs = c['tabs']
  if (bridge && tabs) {
    const glob = (pattern: string): RegExp => {
      if (pattern === '<all_urls>') return /^(https?|file|ftp):/
      return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    }
    const matches = (tab: Record<string, unknown>, info: Record<string, unknown>): boolean => {
      for (const key of ['active', 'highlighted', 'audible', 'status', 'pinned', 'index', 'windowId'] as const) {
        const wanted = key === 'windowId' && info[key] === -2 ? 1 : info[key]
        if (wanted !== undefined && tab[key] !== wanted) return false
      }
      if (info['url'] !== undefined) {
        const patterns = Array.isArray(info['url']) ? (info['url'] as string[]) : [info['url'] as string]
        if (!patterns.some((p) => glob(p).test(String(tab['url'] ?? '')))) return false
      }
      if (typeof info['title'] === 'string' && !glob(info['title']).test(String(tab['title'] ?? ''))) return false
      return true
    }
    const answer = <T,>(promise: Promise<T>, callback?: unknown): Promise<T> => {
      if (typeof callback === 'function') void promise.then((value) => callback(value))
      return promise
    }
    tabs['query'] = (info: Record<string, unknown> = {}, callback?: unknown) =>
      answer(bridge.list().then((list) => list.filter((tab) => matches(tab, info ?? {}))), callback)
    const nativeGet = typeof tabs['get'] === 'function' ? (tabs['get'] as (id: number) => Promise<unknown>).bind(tabs) : null
    tabs['get'] = (id: number, callback?: unknown) =>
      answer(
        bridge.list().then((list) => list.find((tab) => tab['id'] === id) ?? (nativeGet ? nativeGet(id) : Promise.reject(new Error(`No tab with id: ${id}.`)))),
        callback
      )
  }
}

// Le pont passe en argument (contextBridge transmet les fonctions d'un monde à l'autre) : c'est
// ce qui marche aussi dans les moteurs d'arrière-plan, où exposeInMainWorld n'a pas d'effet.
const bridge: TabsBridge = { list: () => ipcRenderer.invoke('kaze-ext:tabs') as Promise<Record<string, unknown>[]> }
contextBridge.executeInMainWorld({ func: kazeCompat, args: [bridge] })

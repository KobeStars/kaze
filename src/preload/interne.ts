/**
 * Preload des onglets. Il est chargé dans TOUTES les pages des onglets, mais n'expose
 * quelque chose qu'aux pages internes de Kaze :
 *  - kaze://accueil → window.kazeInterne (données de l'accueil, widgets)
 *  - kaze://studio  → window.kazeStudio (fichiers du projet ouvert, aperçu)
 *  - kaze://bienvenue → window.kazeBienvenue (réglages du premier lancement)
 * Les sites web ne voient rien ; et même s'ils appelaient ces canaux, le principal vérifie
 * l'origine exacte de chaque appel.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { KazeBienvenueApi, KazeInterneApi, KazeStudioApi } from '@shared/api'
import type { HomeData, StudioEvent } from '@shared/types'
import type { Lang } from '@shared/i18n'

// Le preload s'exécute dans la page : `location` existe (le tsconfig Node ne le connaît pas).
declare const location: { protocol: string; hostname: string }

const internal = location.protocol === 'kaze:'

// Langue de Kaze, pour toutes les pages internes.
if (internal) contextBridge.exposeInMainWorld('kazeLang', ipcRenderer.sendSync('app:lang') as Lang)

if (internal && location.hostname === 'accueil') {
  const api: KazeInterneApi = {
    getHome: () => ipcRenderer.invoke('interne:get-home'),
    navigate: (input) => ipcRenderer.invoke('interne:navigate', String(input).slice(0, 8192)),
    saveNotes: (text) => ipcRenderer.invoke('interne:save-notes', text),
    saveTodos: (todos) => ipcRenderer.invoke('interne:save-todos', todos),
    saveLayout: (widgets) => ipcRenderer.invoke('interne:save-layout', widgets),
    weather: () => ipcRenderer.invoke('interne:weather'),
    dailyImage: () => ipcRenderer.invoke('interne:daily-image'),
    onHomeChanged(listener) {
      const wrapped = (_event: IpcRendererEvent, data: HomeData): void => listener(data)
      ipcRenderer.on('interne:home-changed', wrapped)
      return () => {
        ipcRenderer.removeListener('interne:home-changed', wrapped)
      }
    }
  }
  contextBridge.exposeInMainWorld('kazeInterne', api)
}

if (internal && location.hostname === 'bienvenue') {
  const api: KazeBienvenueApi = {
    get: () => ipcRenderer.invoke('bienvenue:get'),
    set: (patch) => ipcRenderer.invoke('bienvenue:set', patch),
    done: () => ipcRenderer.invoke('bienvenue:done')
  }
  contextBridge.exposeInMainWorld('kazeBienvenue', api)
}

if (internal && location.hostname === 'studio') {
  const api: KazeStudioApi = {
    invoke(channel, ...args) {
      if (!/^studio:[a-z-]+$/.test(channel)) throw new Error(`Canal non autorisé : ${channel}`)
      return ipcRenderer.invoke(channel, ...args)
    },
    onEvent(listener) {
      const wrapped = (_event: IpcRendererEvent, data: StudioEvent): void => listener(data)
      ipcRenderer.on('studio:event', wrapped)
      return () => {
        ipcRenderer.removeListener('studio:event', wrapped)
      }
    }
  }
  contextBridge.exposeInMainWorld('kazeStudio', api)
}

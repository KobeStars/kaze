/**
 * Preload de l'interface (kaze://app) : le seul pont entre l'interface React et Electron.
 *
 * Exposé via contextBridge (isolation de contexte + sandbox) : l'interface n'a jamais accès
 * à ipcRenderer ni à Node. Seuls les canaux du contrat (src/shared/ipc.ts) passent, et le
 * processus principal revalide chaque message (expéditeur + arguments).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { KazeApi } from '@shared/api'
import type { Lang } from '@shared/i18n'

/** Familles de canaux autorisées (le principal refuse de toute façon les canaux inconnus). */
const ALLOWED = /^(window|app|browser|tab|view|workspace|split|panel|bookmarks|history|downloads|settings|shortcuts|shield|storm|vpn|responsive|ext|suggest|data|layout|find|ui|update):[a-z-]+$/

function check(channel: string): void {
  if (!ALLOWED.test(channel)) throw new Error(`Canal IPC non autorisé : ${channel}`)
}

const api: KazeApi = {
  lang: ipcRenderer.sendSync('app:lang') as Lang,
  invoke(channel, ...args) {
    check(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  send(channel, ...args) {
    check(channel)
    ipcRenderer.send(channel, ...args)
  },
  on(channel, listener) {
    check(channel)
    // On ne transmet jamais l'objet `event` (il donne accès à l'expéditeur).
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload as never)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('kaze', api)

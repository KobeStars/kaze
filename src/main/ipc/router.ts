/**
 * Routeur IPC typé : enregistre les gestionnaires du contrat (src/shared/ipc.ts)
 * en vérifiant systématiquement l'expéditeur et les arguments.
 */
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  internalSchemas,
  invokeSchemas,
  sendSchemas,
  type EventChannel,
  type EventPayloads,
  type InternalArgs,
  type InternalChannel,
  type InternalResults,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResults,
  type SendArgs,
  type SendChannel,
  studioSchemas,
  type StudioArgs,
  type StudioChannel,
  type StudioResults
} from '@shared/ipc'
import { isTrustedInternalUrl, isTrustedUiUrl } from '../security'

type Awaitable<T> = T | Promise<T>

/** L'expéditeur est-il le cadre principal de l'interface Kaze ? */
function fromUi(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const frame = event.senderFrame
  return frame !== null && frame === event.sender.mainFrame && isTrustedUiUrl(frame.url)
}

/** L'expéditeur est-il le cadre principal de la page interne `host` ? */
function fromInternalPage(event: IpcMainInvokeEvent, host: 'accueil' | 'studio' | 'bienvenue' = 'accueil'): boolean {
  const frame = event.senderFrame
  return frame !== null && frame === event.sender.mainFrame && isTrustedInternalUrl(frame.url, host)
}

/** Gestionnaire d'un canal invoke de l'interface. */
export function handle<C extends InvokeChannel>(
  channel: C,
  handler: (args: InvokeArgs<C>, event: IpcMainInvokeEvent) => Awaitable<InvokeResults[C]>
): void {
  const schema = invokeSchemas[channel]
  ipcMain.handle(channel, async (event, ...raw: unknown[]) => {
    if (!fromUi(event)) throw new Error(`IPC refusé (${channel}) : expéditeur non autorisé`)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error(`IPC refusé (${channel}) : arguments invalides`)
    return handler(parsed.data as InvokeArgs<C>, event)
  })
}

/** Gestionnaire d'un message sans réponse de l'interface. */
export function listen<C extends SendChannel>(channel: C, handler: (args: SendArgs<C>, event: IpcMainEvent) => void): void {
  const schema = sendSchemas[channel]
  ipcMain.on(channel, (event, ...raw: unknown[]) => {
    if (!fromUi(event)) return
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return
    handler(parsed.data as SendArgs<C>, event)
  })
}

/** Gestionnaire d'un canal de la page d'accueil interne. */
export function handleInternal<C extends InternalChannel>(
  channel: C,
  handler: (args: InternalArgs<C>, event: IpcMainInvokeEvent) => Awaitable<InternalResults[C]>
): void {
  const schema = internalSchemas[channel]
  ipcMain.handle(channel, async (event, ...raw: unknown[]) => {
    // Les canaux « bienvenue: » sont réservés à kaze://bienvenue, les autres à kaze://accueil.
    const host = channel.startsWith('bienvenue:') ? 'bienvenue' : 'accueil'
    if (!fromInternalPage(event, host)) throw new Error(`IPC refusé (${channel}) : expéditeur non autorisé`)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error(`IPC refusé (${channel}) : arguments invalides`)
    return handler(parsed.data as InternalArgs<C>, event)
  })
}

/** Gestionnaire d'un canal de Kaze Studio (kaze://studio uniquement). */
export function handleStudio<C extends StudioChannel>(
  channel: C,
  handler: (args: StudioArgs<C>, event: IpcMainInvokeEvent) => Awaitable<StudioResults[C]>
): void {
  const schema = studioSchemas[channel]
  ipcMain.handle(channel, async (event, ...raw: unknown[]) => {
    if (!fromInternalPage(event, 'studio')) throw new Error(`IPC refusé (${channel}) : expéditeur non autorisé`)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error(`IPC refusé (${channel}) : ${parsed.error.issues[0]?.message ?? 'arguments invalides'}`)
    return handler(parsed.data as StudioArgs<C>, event)
  })
}

/** Envoie un évènement typé à un webContents (ignoré s'il a été détruit). */
export function emit<C extends EventChannel>(target: WebContents | null | undefined, channel: C, payload: EventPayloads[C]): void {
  if (target && !target.isDestroyed()) target.send(channel, payload)
}

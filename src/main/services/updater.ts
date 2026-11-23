/**
 * Mises à jour automatiques (electron-updater).
 *
 * Kaze vérifie les nouvelles versions publiées (GitHub Releases, voir electron-builder.yml)
 * 15 s après le démarrage puis toutes les 4 heures, les télécharge en arrière-plan (seules
 * les parties modifiées, grâce au fichier .blockmap) et les installe au prochain redémarrage.
 * L'interface propose aussi de redémarrer tout de suite.
 *
 * En développement (application non installée), rien n'est vérifié.
 */
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import type { SettingsService } from './settings'

const FIRST_CHECK = 15_000
const INTERVAL = 4 * 3_600_000

export class UpdaterService extends EventEmitter<{ changed: [UpdateState] }> {
  private state: UpdateState = {
    status: app.isPackaged ? 'attente' : 'desactive',
    current: app.getVersion(),
    available: null,
    progress: 0,
    error: null,
    checkedAt: null
  }

  constructor(private readonly settings: SettingsService) {
    super()
    if (!app.isPackaged) return
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ status: 'recherche', error: null }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'a-jour', checkedAt: Date.now() }))
    autoUpdater.on('update-available', (info) =>
      this.set({ status: 'telechargement', available: info.version, progress: 0, checkedAt: Date.now() })
    )
    autoUpdater.on('download-progress', (p) => this.set({ status: 'telechargement', progress: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'pret', available: info.version, progress: 100 }))
    autoUpdater.on('error', (error) => {
      // Une mise à jour déjà prête reste installable même si une vérification échoue ensuite.
      if (this.state.status === 'pret') return
      this.set({ status: 'erreur', error: readableError(error), checkedAt: Date.now() })
    })

    setTimeout(() => this.automaticCheck(), FIRST_CHECK)
    setInterval(() => this.automaticCheck(), INTERVAL)
  }

  get(): UpdateState {
    return this.state
  }

  /** Vérification demandée par l'utilisateur (même si l'automatique est désactivé). */
  check(): void {
    if (!app.isPackaged || this.state.status === 'telechargement' || this.state.status === 'pret') return
    autoUpdater.checkForUpdates().catch(() => undefined) // l'erreur arrive aussi par l'évènement « error »
  }

  /** Redémarre Kaze pour installer la mise à jour téléchargée. */
  install(): void {
    if (this.state.status !== 'pret') return
    // Installation silencieuse, puis Kaze se relance tout seul.
    autoUpdater.quitAndInstall(true, true)
  }

  private automaticCheck(): void {
    if (this.settings.get().autoUpdate) this.check()
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit('changed', this.state)
  }
}

function readableError(error: Error): string {
  const message = error.message ?? String(error)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(message)) return 'Pas de connexion au serveur de mises à jour.'
  if (/404|latest\.yml/i.test(message)) return 'Aucune version publiée pour le moment.'
  return message.split('\n')[0]!.slice(0, 200)
}

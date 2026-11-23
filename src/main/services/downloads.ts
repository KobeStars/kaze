/**
 * Téléchargements : enregistrement automatique dans le dossier choisi (sans boîte de
 * dialogue, comme Chrome), suivi de la progression, pause / reprise / annulation.
 */
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { shell, type DownloadItem, type Session } from 'electron'
import type { DownloadEntry } from '@shared/types'
import { JsonStore, newId } from '../store'
import type { SettingsService } from './settings'

const MAX_ENTRIES = 200

function repair(raw: unknown): DownloadEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((d): d is DownloadEntry => typeof d === 'object' && d !== null && typeof d.id === 'string')
    // Un téléchargement en cours lors de la fermeture est considéré comme interrompu.
    .map((d) => (d.status === 'progressing' || d.status === 'paused' ? { ...d, status: 'interrupted', speed: 0 } : d))
}

/** Trouve un nom libre : « photo.png », « photo (1).png », « photo (2).png »… */
function uniquePath(dir: string, filename: string, reserved: Set<string>): string {
  const safe = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200) || 'telechargement'
  const ext = extname(safe)
  const base = safe.slice(0, safe.length - ext.length)
  let candidate = join(dir, safe)
  for (let i = 1; existsSync(candidate) || reserved.has(candidate); i++) {
    candidate = join(dir, `${base} (${i})${ext}`)
  }
  return candidate
}

export class DownloadsService extends EventEmitter<{ changed: [DownloadEntry[]]; started: []; completed: [] }> {
  private readonly store = new JsonStore<DownloadEntry[]>('telechargements', repair)
  private readonly items = new Map<string, DownloadItem>()
  private notifyTimer: NodeJS.Timeout | null = null

  constructor(private readonly settings: SettingsService) {
    super()
  }

  list(): DownloadEntry[] {
    return this.store.get()
  }

  /** Branche le suivi des téléchargements sur la session des onglets. */
  attach(session: Session): void {
    session.on('will-download', (_event, item) => this.track(item))
  }

  private track(item: DownloadItem): void {
    const id = newId()
    const reserved = new Set(this.store.get().filter((d) => d.status === 'progressing').map((d) => d.path))
    const path = uniquePath(this.settings.downloadDir(), item.getFilename(), reserved)
    item.setSavePath(path)
    this.items.set(id, item)

    const entry: DownloadEntry = {
      id,
      filename: basename(path),
      path,
      url: item.getURL(),
      status: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      speed: 0
    }
    this.store.get().unshift(entry)
    this.store.set(this.store.get().slice(0, MAX_ENTRIES))
    this.emit('started')
    this.notify(true)

    let lastBytes = 0
    let lastTime = Date.now()
    item.on('updated', (_e, state) => {
      const now = Date.now()
      const received = item.getReceivedBytes()
      const elapsed = (now - lastTime) / 1000
      if (elapsed >= 0.5) {
        const instant = (received - lastBytes) / elapsed
        entry.speed = entry.speed === 0 ? instant : entry.speed * 0.7 + instant * 0.3
        lastBytes = received
        lastTime = now
      }
      entry.receivedBytes = received
      entry.totalBytes = item.getTotalBytes()
      entry.status = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
      this.notify()
    })
    item.once('done', (_e, state) => {
      entry.status = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      entry.receivedBytes = item.getReceivedBytes()
      entry.speed = 0
      this.items.delete(id)
      this.notify(true)
      if (state === 'completed') this.emit('completed')
    })
  }

  action(id: string, action: 'pause' | 'resume' | 'cancel' | 'open' | 'show' | 'remove'): void {
    const entry = this.store.get().find((d) => d.id === id)
    if (!entry) return
    const item = this.items.get(id)
    switch (action) {
      case 'pause':
        item?.pause()
        entry.status = 'paused'
        break
      case 'resume':
        if (item?.canResume()) {
          item.resume()
          entry.status = 'progressing'
        }
        break
      case 'cancel':
        item?.cancel()
        break
      case 'open':
        if (entry.status === 'completed' && existsSync(entry.path)) void shell.openPath(entry.path)
        return
      case 'show':
        if (existsSync(entry.path)) shell.showItemInFolder(entry.path)
        else void shell.openPath(this.settings.downloadDir())
        return
      case 'remove':
        if (item) item.cancel()
        this.store.set(this.store.get().filter((d) => d.id !== id))
        break
    }
    this.notify(true)
  }

  /** Retire de la liste les téléchargements terminés (les fichiers restent sur le disque). */
  clear(): void {
    this.store.set(this.store.get().filter((d) => d.status === 'progressing' || d.status === 'paused'))
    this.notify(true)
  }

  activeCount(): number {
    return this.items.size
  }

  private notify(now = false): void {
    this.store.set(this.store.get())
    if (now) {
      if (this.notifyTimer) clearTimeout(this.notifyTimer)
      this.notifyTimer = null
      this.emit('changed', this.store.get())
      return
    }
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      this.emit('changed', this.store.get())
    }, 250)
  }
}

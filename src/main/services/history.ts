/**
 * Historique de navigation : une entrée par adresse (dernière visite + nombre de visites),
 * limité aux 8 000 adresses les plus récentes.
 */
import { EventEmitter } from 'node:events'
import type { HistoryEntry } from '@shared/types'
import { JsonStore, newId } from '../store'

const MAX_ENTRIES = 8000

function repair(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is HistoryEntry =>
      typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.url === 'string' && typeof e.lastVisit === 'number'
  )
}

/** Normalise un texte pour la recherche (minuscules, sans accents). */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export class HistoryService extends EventEmitter<{ changed: [] }> {
  private readonly store = new JsonStore<HistoryEntry[]>('historique', repair)
  private readonly byUrl = new Map<string, HistoryEntry>()
  private notifyTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    for (const entry of this.store.get()) this.byUrl.set(entry.url, entry)
  }

  /** Enregistre une visite (pages web uniquement). */
  record(url: string, title: string, favicon: string | null): void {
    if (!/^https?:/i.test(url)) return
    const existing = this.byUrl.get(url)
    if (existing) {
      existing.lastVisit = Date.now()
      existing.visitCount += 1
      if (title) existing.title = title
      if (favicon) existing.favicon = favicon
    } else {
      const entry: HistoryEntry = { id: newId(), url, title: title || url, favicon, lastVisit: Date.now(), visitCount: 1 }
      this.byUrl.set(url, entry)
      this.store.get().push(entry)
      this.trim()
    }
    this.save()
  }

  updateTitle(url: string, title: string): void {
    const entry = this.byUrl.get(url)
    if (entry && title && entry.title !== title) {
      entry.title = title
      this.save()
    }
  }

  updateFavicon(url: string, favicon: string): void {
    const entry = this.byUrl.get(url)
    if (entry && entry.favicon !== favicon) {
      entry.favicon = favicon
      this.save()
    }
  }

  /** Recherche par titre ou adresse, résultats du plus récent au plus ancien. */
  search(query: string, limit: number): HistoryEntry[] {
    const q = fold(query.trim())
    const all = [...this.store.get()].sort((a, b) => b.lastVisit - a.lastVisit)
    if (!q) return all.slice(0, limit)
    const words = q.split(/\s+/)
    return all.filter((e) => {
      const hay = fold(`${e.title} ${e.url}`)
      return words.every((w) => hay.includes(w))
    }).slice(0, limit)
  }

  /** Adresses les plus visitées (pour les suggestions). */
  frecent(query: string, limit: number): HistoryEntry[] {
    const q = fold(query.trim())
    if (!q) return []
    const now = Date.now()
    return this.store
      .get()
      .filter((e) => fold(`${e.title} ${e.url}`).includes(q))
      .map((e) => {
        const ageDays = (now - e.lastVisit) / 86_400_000
        const urlBonus = fold(e.url.replace(/^https?:\/\/(www\.)?/, '')).startsWith(q) ? 20 : 0
        return { e, score: e.visitCount * 4 + urlBonus - Math.min(ageDays, 60) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.e)
  }

  remove(id: string): void {
    const list = this.store.get()
    const index = list.findIndex((e) => e.id === id)
    if (index === -1) return
    const [removed] = list.splice(index, 1)
    if (removed) this.byUrl.delete(removed.url)
    this.save()
  }

  /** Efface la dernière heure, les dernières 24 h ou tout l'historique. */
  clear(range: 'heure' | 'jour' | 'tout'): void {
    if (range === 'tout') {
      this.store.set([])
      this.byUrl.clear()
    } else {
      const limit = Date.now() - (range === 'heure' ? 3_600_000 : 86_400_000)
      const kept = this.store.get().filter((e) => e.lastVisit < limit)
      this.store.set(kept)
      this.byUrl.clear()
      for (const e of kept) this.byUrl.set(e.url, e)
    }
    this.save()
  }

  private trim(): void {
    const list = this.store.get()
    if (list.length <= MAX_ENTRIES) return
    list.sort((a, b) => b.lastVisit - a.lastVisit)
    for (const removed of list.splice(MAX_ENTRIES)) this.byUrl.delete(removed.url)
  }

  private save(): void {
    this.store.set(this.store.get())
    // Les panneaux ouverts sont prévenus au plus une fois par seconde.
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      this.emit('changed')
    }, 1000)
  }
}

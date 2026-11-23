/**
 * Favoris : liste simple (les plus récents en premier), recherche par titre ou adresse.
 * Les premiers favoris servent de raccourcis sur la page d'accueil.
 */
import { EventEmitter } from 'node:events'
import type { Bookmark } from '@shared/types'
import { JsonStore, newId } from '../store'
import { fold } from './history'

function repair(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is Bookmark => typeof b === 'object' && b !== null && typeof b.id === 'string' && typeof b.url === 'string'
  )
}

export class BookmarksService extends EventEmitter<{ changed: [Bookmark[]] }> {
  private readonly store = new JsonStore<Bookmark[]>('favoris', repair)

  list(): Bookmark[] {
    return this.store.get()
  }

  has(url: string): boolean {
    return this.store.get().some((b) => b.url === url)
  }

  add(url: string, title: string, favicon: string | null = null): void {
    if (this.has(url)) return
    this.store.get().unshift({ id: newId(), url, title: title || url, favicon, createdAt: Date.now() })
    this.changed()
  }

  update(id: string, data: { url: string; title: string }): void {
    const bookmark = this.store.get().find((b) => b.id === id)
    if (!bookmark) return
    bookmark.url = data.url
    bookmark.title = data.title || data.url
    this.changed()
  }

  remove(id: string): void {
    this.store.set(this.store.get().filter((b) => b.id !== id))
    this.changed()
  }

  /** Ajoute ou retire une adresse des favoris. */
  toggle(url: string, title: string, favicon: string | null): void {
    const existing = this.store.get().find((b) => b.url === url)
    if (existing) this.remove(existing.id)
    else this.add(url, title, favicon)
  }

  /** Met à jour l'icône d'un favori quand on visite le site. */
  updateFavicon(url: string, favicon: string): void {
    const bookmark = this.store.get().find((b) => b.url === url)
    if (bookmark && bookmark.favicon !== favicon) {
      bookmark.favicon = favicon
      this.changed()
    }
  }

  search(query: string, limit: number): Bookmark[] {
    const q = fold(query.trim())
    if (!q) return []
    return this.store
      .get()
      .filter((b) => fold(`${b.title} ${b.url}`).includes(q))
      .slice(0, limit)
  }

  private changed(): void {
    this.store.set(this.store.get())
    this.emit('changed', this.store.get())
  }
}

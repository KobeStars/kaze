/**
 * Tempête : mode focus. Pendant la durée choisie, les sites de la liste sont bloqués.
 * La fin est mémorisée sur le disque : redémarrer Kaze ne permet pas d'y échapper.
 */
import { EventEmitter } from 'node:events'
import { Notification } from 'electron'
import { hostMatches, hostnameOf } from '@shared/url'
import { JsonStore } from '../store'
import type { SettingsService } from './settings'

interface StormData {
  until: number | null
}

export class StormService extends EventEmitter<{ changed: [] }> {
  private readonly store = new JsonStore<StormData>('tempete', (raw) => {
    const until = (raw as StormData | undefined)?.until
    return { until: typeof until === 'number' && until > Date.now() ? until : null }
  })
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly settings: SettingsService) {
    super()
    this.schedule()
  }

  get until(): number | null {
    const until = this.store.get().until
    return until && until > Date.now() ? until : null
  }

  get active(): boolean {
    return this.until !== null
  }

  start(minutes: number): void {
    this.store.set({ until: Date.now() + minutes * 60_000 })
    this.schedule()
    this.emit('changed')
  }

  stop(notify = false): void {
    this.store.set({ until: null })
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (notify && Notification.isSupported()) {
      new Notification({ title: 'Tempête terminée', body: 'Le vent est retombé : tous les sites sont de nouveau accessibles.' }).show()
    }
    this.emit('changed')
  }

  /** Hôte bloqué si l'adresse fait partie de la liste pendant une Tempête, sinon null. */
  blockedHost(url: string): string | null {
    if (!this.active || !/^https?:/i.test(url)) return null
    const host = hostnameOf(url)
    const hit = this.settings.get().storm.sites.find((domain) => hostMatches(host, domain))
    return hit ?? null
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    const until = this.until
    if (!until) return
    // setTimeout est limité à ~24 jours ; la durée max d'une Tempête est de 8 h.
    this.timer = setTimeout(() => this.stop(true), until - Date.now())
  }
}

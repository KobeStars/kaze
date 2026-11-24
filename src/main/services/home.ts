/**
 * Données des widgets de la page d'accueil : notes et to-do (sauvegardées), météo
 * (Open-Meteo, sans clé d'API) et image du jour (Bing). Les requêtes réseau passent
 * par le processus principal et sont mises en cache.
 */
import { EventEmitter } from 'node:events'
import { net } from 'electron'
import type { DailyImage, HomeWidgetsData, TodoItem, WeatherData } from '@shared/types'
import { JsonStore } from '../store'
import { lang, locale, N_, t } from '@shared/i18n'

/** Codes météo WMO → libellé français. */
const WEATHER_LABELS: [number[], string][] = [
  [[0], N_('Ciel dégagé')],
  [[1], N_('Plutôt dégagé')],
  [[2], N_('Partiellement nuageux')],
  [[3], N_('Couvert')],
  [[45, 48], N_('Brouillard')],
  [[51, 53, 55, 56, 57], N_('Bruine')],
  [[61, 63, 65, 66, 67], N_('Pluie')],
  [[71, 73, 75, 77], N_('Neige')],
  [[80, 81, 82], N_('Averses')],
  [[85, 86], N_('Averses de neige')],
  [[95, 96, 99], N_('Orage')]
]

function repair(raw: unknown): HomeWidgetsData {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<HomeWidgetsData>
  return {
    notes: typeof data.notes === 'string' ? data.notes : '',
    todos: Array.isArray(data.todos) ? data.todos.filter((t) => typeof t?.id === 'string' && typeof t.text === 'string') : []
  }
}

export class HomeService extends EventEmitter<{ changed: [] }> {
  private readonly store = new JsonStore<HomeWidgetsData>('accueil', repair)
  private weatherCache: { city: string; at: number; data: WeatherData | null } | null = null
  private imageCache: { day: string; data: DailyImage | null } | null = null

  widgets(): HomeWidgetsData {
    return this.store.get()
  }

  saveNotes(notes: string): void {
    this.store.update((d) => (d.notes = notes))
  }

  saveTodos(todos: TodoItem[]): void {
    this.store.update((d) => (d.todos = todos))
    this.emit('changed')
  }

  async weather(city: string): Promise<WeatherData | null> {
    const name = city.trim()
    if (!name) return null
    if (this.weatherCache && this.weatherCache.city === name && Date.now() - this.weatherCache.at < 30 * 60_000) {
      return this.weatherCache.data
    }
    try {
      const geo = (await (
        await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=${lang()}`)
      ).json()) as { results?: { latitude: number; longitude: number; name: string }[] }
      const place = geo.results?.[0]
      if (!place) throw new Error('Ville introuvable')
      const forecast = (await (
        await net.fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            '&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1'
        )
      ).json()) as {
        current: { temperature_2m: number; weather_code: number; wind_speed_10m: number }
        daily: { temperature_2m_max: number[]; temperature_2m_min: number[] }
      }
      const code = forecast.current.weather_code
      const data: WeatherData = {
        city: place.name,
        temperature: Math.round(forecast.current.temperature_2m),
        code,
        label: t(WEATHER_LABELS.find(([codes]) => codes.includes(code))?.[1] ?? N_('Météo')),
        wind: Math.round(forecast.current.wind_speed_10m),
        min: Math.round(forecast.daily.temperature_2m_min[0] ?? 0),
        max: Math.round(forecast.daily.temperature_2m_max[0] ?? 0)
      }
      this.weatherCache = { city: name, at: Date.now(), data }
      return data
    } catch (error) {
      console.warn('[accueil] météo indisponible', error)
      this.weatherCache = { city: name, at: Date.now() - 25 * 60_000, data: null }
      return null
    }
  }

  /** Image du jour de Bing (change chaque jour). */
  async dailyImage(): Promise<DailyImage | null> {
    const day = new Date().toDateString()
    if (this.imageCache?.day === day) return this.imageCache.data
    try {
      const json = (await (
        await net.fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${locale()}`)
      ).json()) as { images?: { url: string; title?: string; copyright?: string }[] }
      const image = json.images?.[0]
      const data = image ? { url: `https://www.bing.com${image.url}`, title: image.title ?? '', credit: image.copyright ?? '' } : null
      this.imageCache = { day, data }
      return data
    } catch (error) {
      console.warn('[accueil] image du jour indisponible', error)
      return null
    }
  }
}

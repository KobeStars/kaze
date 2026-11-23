/**
 * Stockage local en fichiers JSON (dans %APPDATA%\Kaze).
 *
 * Pourquoi pas SQLite ou electron-store ? Les volumes restent petits (quelques milliers
 * d'entrées), tout tient en mémoire, et on évite un module natif à recompiler pour
 * Electron. Les écritures sont regroupées (300 ms) et atomiques : on écrit un fichier
 * temporaire puis on le renomme, ce qui évite un fichier à moitié écrit en cas de coupure.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const stores = new Set<JsonStore<unknown>>()

export class JsonStore<T> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  private readonly file: string

  /**
   * @param name    nom du fichier (sans extension)
   * @param repair  transforme le contenu lu (éventuellement invalide) en données propres
   */
  constructor(name: string, repair: (raw: unknown) => T) {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, `${name}.json`)
    let raw: unknown = undefined
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'))
      } catch (error) {
        console.warn(`[stockage] ${name}.json illisible, valeurs par défaut utilisées`, error)
      }
    }
    this.data = repair(raw)
    stores.add(this as JsonStore<unknown>)
  }

  get(): T {
    return this.data
  }

  /** Remplace les données et programme l'écriture. */
  set(next: T): void {
    this.data = next
    this.scheduleSave()
  }

  /** Modifie les données en place et programme l'écriture. */
  update(mutator: (data: T) => void): void {
    mutator(this.data)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), 300)
  }

  /** Écrit immédiatement sur le disque (appelé aussi à la fermeture de l'application). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
      renameSync(tmp, this.file)
    } catch (error) {
      console.error(`[stockage] écriture impossible : ${this.file}`, error)
    }
  }
}

/** Écrit tous les fichiers en attente (à appeler avant de quitter). */
export function flushAllStores(): void {
  for (const store of stores) store.flush()
}

/** Identifiant court et unique. */
export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

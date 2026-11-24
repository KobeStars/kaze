/**
 * Brume : le VPN de Kaze, qui fait passer les onglets par le réseau Tor.
 *
 * Kaze lance son propre tor.exe (Tor Expert Bundle officiel, installé par scripts/tor.mjs)
 * et règle la session des onglets sur son proxy SOCKS5 local. Chromium envoie alors les
 * noms de domaine à Tor (pas de requête DNS en clair) ; l'interface et les mises à jour
 * ne passent pas par Tor.
 *
 * Sécurité : le proxy est posé AVANT de lancer Tor, et reste en place si Tor s'arrête ou
 * n'arrive pas à se connecter. Tant que Brume est activée, une page ne part donc jamais
 * en direct : elle échoue, et l'interface propose de réessayer ou de désactiver Brume.
 * WebRTC (visio dans le navigateur) est limité au proxy pour ne pas révéler la vraie IP.
 *
 * Les réglages (activée, pays de sortie) sont la source de vérité : Brume suit leurs
 * changements, d'où qu'ils viennent.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { app, webContents, type Session, type WebContents } from 'electron'
import type { VpnCountry } from '@shared/constants'
import type { VpnState } from '@shared/types'
import type { SettingsService } from './settings'
import { t } from '@shared/i18n'

/** Au-delà, la connexion au réseau Tor est considérée comme impossible. */
const BOOTSTRAP_TIMEOUT = 120_000

export class VpnService extends EventEmitter<{ changed: [] }> {
  private child: ChildProcess | null = null
  private port = 0
  /** Pays de sortie du Tor en place ; null quand Brume est désactivée (connexion directe). */
  private country: VpnCountry | null = null
  private timeout: NodeJS.Timeout | null = null
  private queue: Promise<void> = Promise.resolve()
  private current: VpnState = { status: 'eteint', progress: 0, ip: null, country: null, error: null }

  constructor(
    private readonly settings: SettingsService,
    private readonly session: Session
  ) {
    super()
    settings.on('changed', () => void this.sync())
    app.on('web-contents-created', (_event, contents) => {
      if (contents.session === session) this.applyWebRtc(contents)
    })
    app.on('will-quit', () => this.stopTor())
  }

  get state(): VpnState {
    return this.current
  }

  /**
   * Aligne Brume sur les réglages. Au démarrage, à attendre avant d'ouvrir les onglets :
   * la promesse se termine une fois le proxy posé (la connexion à Tor continue ensuite).
   */
  sync(): Promise<void> {
    return this.enqueue(async () => {
      const { enabled, country } = this.settings.get().vpn
      if (!enabled) {
        if (this.country !== null) await this.disconnect()
      } else if (this.country !== country) {
        await this.connect(country)
      }
    })
  }

  /** Relance Tor : nouvelle identité (nouvelle IP), ou nouvel essai après une erreur. */
  reconnect(): Promise<void> {
    return this.enqueue(async () => {
      const { enabled, country } = this.settings.get().vpn
      if (enabled) await this.connect(country)
    })
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((error: Error) => this.fail(t('Brume n’a pas pu démarrer : {erreur}', { erreur: error.message })))
    return this.queue
  }

  private async connect(country: VpnCountry): Promise<void> {
    this.stopTor()
    this.port = await freePort()
    this.country = country
    // Le proxy d'abord : aucune page ne sort en direct pendant la connexion.
    await this.applyProxy()
    this.update({ status: 'connexion', progress: 0, ip: null, country: null, error: null })

    const dir = app.isPackaged ? join(process.resourcesPath, 'tor') : join(app.getAppPath(), 'resources', 'tor')
    const exe = join(dir, 'tor', 'tor.exe')
    if (!existsSync(exe)) {
      this.fail(app.isPackaged ? t('Tor est introuvable : réinstallez Kaze.') : t('Tor n’est pas installé : lancez « npm run tor ».'))
      return
    }
    const args = [
      '--ignore-missing-torrc',
      '--SocksPort', `127.0.0.1:${this.port}`,
      '--DataDirectory', join(app.getPath('userData'), 'tor'),
      '--GeoIPFile', join(dir, 'data', 'geoip'),
      '--GeoIPv6File', join(dir, 'data', 'geoip6'),
      '--ClientOnly', '1',
      '--Log', 'notice stdout',
      // Tor s'arrête de lui-même si Kaze disparaît (plantage).
      '__OwningControllerProcess', String(process.pid),
      ...(country === 'auto' ? [] : ['--ExitNodes', `{${country}}`, '--StrictNodes', '1'])
    ]
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    let lastProblem = ''
    const onLine = (line: string): void => {
      const boot = /Bootstrapped (\d+)%/.exec(line)
      if (boot && this.child === child && this.current.status === 'connexion') {
        const progress = Number(boot[1])
        if (progress >= 100) this.ready(child)
        else this.update({ progress })
      }
      const problem = /\[(?:err|warn)\] (.+)/.exec(line)
      if (problem) lastProblem = problem[1]!
    }
    readLines(child.stdout, onLine)
    readLines(child.stderr, onLine)
    child.on('error', (error) => {
      if (this.child === child) this.fail(t('Impossible de lancer Tor : {erreur}', { erreur: error.message }))
    })
    child.on('exit', () => {
      if (this.child !== child) return
      this.child = null
      this.fail(lastProblem ? t('Tor s’est arrêté ({probleme}).', { probleme: lastProblem }) : t('Tor s’est arrêté.'))
    })
    this.timeout = setTimeout(() => {
      if (this.child !== child || this.current.status !== 'connexion') return
      this.stopTor()
      this.fail(t('Le réseau Tor ne répond pas. Vérifiez la connexion Internet, puis réessayez.'))
    }, BOOTSTRAP_TIMEOUT)
  }

  private async disconnect(): Promise<void> {
    this.stopTor()
    this.country = null
    await this.applyProxy()
    this.update({ status: 'eteint', progress: 0, ip: null, country: null, error: null })
  }

  private ready(child: ChildProcess): void {
    this.clearTimeout()
    this.update({ status: 'actif', progress: 100, error: null })
    void this.checkIp(child)
  }

  /**
   * Demande à check.torproject.org l'adresse IP que voient les sites, puis à Onionoo
   * (l'annuaire officiel des relais Tor) le pays de ce relais de sortie. Les deux requêtes
   * passent elles-mêmes par Tor.
   */
  private async checkIp(child: ChildProcess): Promise<void> {
    try {
      const response = await this.session.fetch('https://check.torproject.org/api/ip', { cache: 'no-store' })
      const data = (await response.json()) as { IsTor?: unknown; IP?: unknown }
      if (this.child !== child) return
      if (data.IsTor === false) {
        this.fail(t('Le trafic ne semble pas passer par Tor : réessayez.'))
        return
      }
      const ip = typeof data.IP === 'string' && /^[0-9a-fA-F.:]{3,45}$/.test(data.IP) ? data.IP : null
      this.update({ ip })
      if (!ip) return
      const relays = await this.session.fetch(`https://onionoo.torproject.org/details?search=${encodeURIComponent(ip)}&fields=country`, { cache: 'no-store' })
      const info = (await relays.json()) as { relays?: { country?: unknown }[] }
      const country = info.relays?.[0]?.country
      if (this.child === child && typeof country === 'string' && /^[a-z]{2}$/.test(country)) this.update({ country })
    } catch {
      // L'adresse reste simplement inconnue.
    }
  }

  /** Erreur : Tor est coupé mais le proxy reste en place (aucune fuite de l'adresse IP). */
  private fail(error: string): void {
    this.clearTimeout()
    this.update({ status: 'erreur', progress: 0, ip: null, country: null, error })
  }

  private stopTor(): void {
    this.clearTimeout()
    const child = this.child
    this.child = null
    child?.kill()
  }

  private clearTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
  }

  private async applyProxy(): Promise<void> {
    await this.session.setProxy(this.country !== null ? { proxyRules: `socks5://127.0.0.1:${this.port}` } : { mode: 'direct' })
    // Les connexions déjà ouvertes passaient par l'ancien chemin.
    await this.session.closeAllConnections()
    for (const contents of webContents.getAllWebContents()) if (contents.session === this.session) this.applyWebRtc(contents)
  }

  private applyWebRtc(contents: WebContents): void {
    contents.setWebRTCIPHandlingPolicy(this.country !== null ? 'disable_non_proxied_udp' : 'default')
  }

  private update(patch: Partial<VpnState>): void {
    this.current = { ...this.current, ...patch }
    this.emit('changed')
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

function readLines(stream: Readable | null, onLine: (line: string) => void): void {
  if (!stream) return
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    lines.forEach(onLine)
  })
}

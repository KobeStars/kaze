/**
 * Installe Tor (le moteur de Brume, le VPN de Kaze) dans resources/tor.
 *
 * On prend le « Tor Expert Bundle » officiel du Tor Project, à une version figée dont
 * l'empreinte SHA-256 est écrite ci-dessous. Cette empreinte a été relevée sur l'archive
 * après vérification de sa signature GPG (clé « Tor Browser Developers »,
 * EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290). Une archive différente est refusée.
 *
 * Changer de version : modifier VERSION et SHA256 (après avoir vérifié la signature .asc).
 *
 * Utilisation : npm run tor (lancé aussi par npm run dist). Ne fait rien si Tor est déjà là.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VERSION = '16.0.1'
const SHA256 = '9eed3c3ff1fe43df034ce360196c9ec95472560d77ff55614d0cd5120edea27b'
const ARCHIVE = `tor-expert-bundle-windows-x86_64-${VERSION}.tar.gz`
const URL = `https://dist.torproject.org/torbrowser/${VERSION}/${ARCHIVE}`
// Seuls tor.exe, les bases GeoIP (choix du pays de sortie) et les licences sont gardés.
const MEMBERS = ['tor/tor.exe', 'data/geoip', 'data/geoip6', 'docs/tor.txt', 'docs/openssl.txt', 'docs/libevent.txt', 'docs/zlib.txt']

const target = join(import.meta.dirname, '..', 'resources', 'tor')
const stamp = join(target, 'VERSION')
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === VERSION && MEMBERS.every((m) => existsSync(join(target, m)))) {
  console.log(`Tor ${VERSION} déjà installé.`)
  process.exit(0)
}

console.log(`Téléchargement de Tor ${VERSION}…`)
const response = await fetch(URL)
if (!response.ok) {
  console.error(`Téléchargement impossible (${response.status}) : ${URL}`)
  process.exit(1)
}
const data = Buffer.from(await response.arrayBuffer())
const hash = createHash('sha256').update(data).digest('hex')
if (hash !== SHA256) {
  console.error(`Empreinte inattendue pour ${ARCHIVE} :\n  reçue    ${hash}\n  attendue ${SHA256}\nRien n'est installé.`)
  process.exit(1)
}

const archivePath = join(tmpdir(), ARCHIVE)
writeFileSync(archivePath, data)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
try {
  // tar.exe est fourni avec Windows 10 et 11.
  execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xzf', archivePath, '-C', target, ...MEMBERS], { stdio: 'inherit' })
} finally {
  rmSync(archivePath, { force: true })
}
writeFileSync(stamp, VERSION + '\n')
console.log(`Tor ${VERSION} installé dans resources/tor.`)

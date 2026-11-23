/**
 * À lancer après la signature externe de l'installateur (SignPath, dans GitHub Actions).
 *
 * Signer modifie le fichier : son empreinte et sa taille changent. Les Kaze installés
 * refuseraient alors la mise à jour, car latest.yml et le .blockmap décrivent encore
 * l'installateur non signé. Ce script les recalcule à partir du fichier signé.
 *
 * Utilisation : node scripts/apres-signature.mjs   (lit dist/latest.yml)
 */
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js')

const dist = 'dist'
const latestPath = join(dist, 'latest.yml')
const latest = readFileSync(latestPath, 'utf8')
const installer = /^path: (.+)$/m.exec(latest)?.[1]?.trim()
const oldSha = /^sha512: (.+)$/m.exec(latest)?.[1]?.trim()
if (!installer || !oldSha) throw new Error('dist/latest.yml illisible (path ou sha512 manquant).')
const file = join(dist, installer)

const sha512 = await new Promise((resolve, reject) => {
  const hash = createHash('sha512')
  createReadStream(file).on('data', (d) => hash.update(d)).on('error', reject).on('end', () => resolve(hash.digest('base64')))
})
const size = statSync(file).size

// Le .blockmap sert aux mises à jour différentielles : il doit décrire le fichier signé.
await buildBlockMap(file, 'gzip', `${file}.blockmap`)

const updated = latest.split(oldSha).join(sha512).replace(/^(\s+size: )\d+$/m, `$1${size}`)
writeFileSync(latestPath, updated)
console.log(`latest.yml et ${installer}.blockmap recalculés (${size} octets).`)

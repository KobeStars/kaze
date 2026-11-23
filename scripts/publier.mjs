/**
 * Publie une nouvelle version de Kaze sur GitHub Releases (dépôt KobeStars/kaze).
 * Les Kaze installés la trouvent tout seuls (au démarrage puis toutes les 4 heures) et
 * l'installent au redémarrage suivant.
 *
 * Utilisation : npm run release            (0.2.1 → 0.2.2)
 *               npm run release -- minor   (0.2.2 → 0.3.0)
 *               npm run release -- major   (0.3.0 → 1.0.0)
 *
 * Il faut l'outil `gh` connecté à GitHub (gh auth login).
 *
 * La release est créée en une seule fois avec ses trois fichiers (installateur, .blockmap,
 * latest.yml) : sans latest.yml, les Kaze installés ne verraient pas la nouvelle version.
 *
 * Signature de l'installateur (facultative tant qu'aucun certificat n'est configuré) :
 *  - certificat installé dans Windows (ex. Certum SimplySign, connecté) :
 *      $env:KAZE_CERT_SHA1 = "<empreinte SHA-1 du certificat>"
 *  - fichier .pfx : $env:CSC_LINK = "C:\chemin\certificat.pfx" et $env:CSC_KEY_PASSWORD = "…"
 * Quand un certificat est configuré, la publication est annulée si la signature n'est pas
 * valide.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const REPO = 'KobeStars/kaze'
const bump = process.argv[2] ?? 'patch'
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage : npm run release [-- patch|minor|major]')
  process.exit(1)
}

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', shell: true })
const quiet = (command, args) => execFileSync(command, args, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

try {
  quiet('gh', ['auth', 'status'])
} catch (error) {
  // gh échoue aussi quand GitHub ne répond pas : on affiche sa vraie réponse.
  const detail = String(error.stderr || error.stdout || error.message).trim()
  console.error('Vérification GitHub impossible (gh non connecté, ou GitHub injoignable) :\n' + detail)
  process.exit(1)
}

// 1. Nouveau numéro de version (sans commit ni tag git : la release GitHub crée le tag).
run('npm', ['version', bump, '--no-git-tag-version'])
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const tag = `v${version}`

let exists = true
try {
  quiet('gh', ['release', 'view', tag, '-R', REPO])
} catch {
  exists = false
}
if (exists) {
  console.error(`La version ${tag} existe déjà sur GitHub : rien n'est publié.`)
  process.exit(1)
}

// 2. Vérification des types, compilation et installateur (sans envoi), signé si possible.
const certSha1 = (process.env.KAZE_CERT_SHA1 ?? '').replace(/\s/g, '')
if (certSha1 && !/^[0-9a-fA-F]{40}$/.test(certSha1)) {
  console.error('KAZE_CERT_SHA1 doit être l’empreinte SHA-1 du certificat (40 caractères hexadécimaux). Rien n’est publié.')
  process.exit(1)
}
// Signature VMP castLabs (Netflix, Spotify) : obligatoire pour publier, sauf KAZE_VMP=facultatif.
if (process.env.KAZE_VMP !== 'facultatif') process.env.KAZE_VMP = 'obligatoire'
const signing = Boolean(certSha1 || process.env.CSC_LINK)
if (!signing) console.warn('Attention : aucun certificat configuré, l’installateur ne sera PAS signé.')
run('npm', ['run', 'dist', ...(certSha1 ? ['--', `-c.win.signtoolOptions.certificateSha1=${certSha1}`] : [])])
const files = [`dist/Kaze-Setup-${version}.exe`, `dist/Kaze-Setup-${version}.exe.blockmap`, 'dist/latest.yml']
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`Fichier manquant : ${file}. Rien n'est publié.`)
    process.exit(1)
  }
}
if (!readFileSync('dist/latest.yml', 'utf8').includes(`version: ${version}`)) {
  console.error('dist/latest.yml ne correspond pas à la nouvelle version. Rien n’est publié.')
  process.exit(1)
}

if (signing) {
  // Vérification par Windows lui-même : la signature doit être valide (certificat reconnu).
  const status = quiet('powershell', ['-NoProfile', '-Command', `"(Get-AuthenticodeSignature -LiteralPath 'dist/Kaze-Setup-${version}.exe').Status"`])
  if (status !== 'Valid') {
    console.error(`La signature de l'installateur n'est pas valide (${status}). Rien n'est publié.`)
    process.exit(1)
  }
  console.log('Installateur signé : signature valide.')
}

// 3. Release GitHub créée avec ses trois fichiers d'un coup.
run('gh', ['release', 'create', tag, ...files, '-R', REPO, '--title', `"Kaze ${version}"`, '--notes', `"Kaze ${version}"`])
console.log(`\nKaze ${version} est publié. Les Kaze installés le recevront automatiquement.`)

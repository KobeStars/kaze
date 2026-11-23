/**
 * Extrait de la police Shippori Mincho uniquement les morceaux contenant les caractères
 * japonais utilisés par l'interface (風, 嵐…). La police complète pèse ~11 Mo par graisse ;
 * ce script n'en garde que quelques dizaines de Ko.
 *
 * Utilisation : npm run polices   (à relancer si vous ajoutez un caractère ci-dessous)
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Caractères japonais affichés par Kaze. */
const CARACTERES = '風嵐息流盾微山川火水木月星花雲海光空森波竹夜'
const GRAISSES = [500, 700]

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(racine, 'node_modules/@fontsource/shippori-mincho')
const sortieFichiers = join(racine, 'src/renderer/src/assets/fonts/jp')
const sortieCss = join(racine, 'src/renderer/src/styles/polices-jp.css')

/** Lit « U+98a8, U+4e00-4e10 » en liste de plages [début, fin]. */
function plages(unicodeRange) {
  return unicodeRange.split(',').map((partie) => {
    const [debut, fin] = partie.trim().replace(/^U\+/i, '').split('-')
    return [parseInt(debut, 16), parseInt(fin ?? debut, 16)]
  })
}

rmSync(sortieFichiers, { recursive: true, force: true })
mkdirSync(sortieFichiers, { recursive: true })

const regles = []
for (const graisse of GRAISSES) {
  const css = readFileSync(join(source, `${graisse}.css`), 'utf8')
  const blocs = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1])
  const retenus = new Set()
  for (const caractere of CARACTERES) {
    const code = caractere.codePointAt(0)
    const bloc = blocs.find((b) => {
      const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1]
      return range && plages(range).some(([d, f]) => code >= d && code <= f)
    })
    if (!bloc) {
      console.warn(`Caractère absent de la police : ${caractere}`)
      continue
    }
    retenus.add(bloc)
  }
  for (const bloc of retenus) {
    const fichier = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(bloc)[1]
    const range = /unicode-range:\s*([^;]+);/.exec(bloc)[1]
    copyFileSync(join(source, 'files', fichier), join(sortieFichiers, fichier))
    regles.push(`@font-face {
  font-family: 'Shippori Mincho';
  font-style: normal;
  font-display: swap;
  font-weight: ${graisse};
  src: url('../assets/fonts/jp/${fichier}') format('woff2');
  unicode-range: ${range};
}`)
  }
}

writeFileSync(
  sortieCss,
  `/* Fichier généré par scripts/polices-jp.mjs — ne pas modifier à la main. */\n${regles.join('\n\n')}\n`
)
const total = readdirSync(sortieFichiers).length
console.log(`${total} fichier(s) de police copiés, CSS écrit dans src/renderer/src/styles/polices-jp.css`)

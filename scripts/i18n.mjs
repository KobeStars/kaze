/**
 * Vérifie la traduction anglaise : chaque texte passé à t('…') ou N_('…') dans src/ doit avoir
 * son entrée dans src/shared/i18n-en.ts. Signale aussi les entrées qui ne servent plus et les
 * appels t(`…`) (gabarit) que le script ne peut pas lire.
 *
 * Usage : npm run i18n  (code de sortie 1 s'il manque une traduction)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = join(racine, 'src')

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fichiers(chemin)
    return /\.(ts|tsx)$/.test(nom) && !/i18n(-en)?\.ts$/.test(nom) ? [chemin] : []
  })
}

// Dictionnaire : l'objet littéral exporté par i18n-en.ts.
const dico = readFileSync(join(src, 'shared', 'i18n-en.ts'), 'utf8')
const debut = dico.indexOf('{', dico.indexOf('export const EN'))
const EN = Function(`return (${dico.slice(debut, dico.lastIndexOf('}') + 1)})`)()

const appel = /(?<![\w.$])(?:t|N_)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
const gabarit = /(?<![\w.$])(?:t|N_)\(\s*`/g
const vus = new Map()
const gabarits = []

for (const fichier of fichiers(src)) {
  const texte = readFileSync(fichier, 'utf8')
  for (const m of texte.matchAll(appel)) {
    const cle = Function(`return ${m[1]}${m[2]}${m[1]}`)()
    const ligne = texte.slice(0, m.index).split('\n').length
    if (!vus.has(cle)) vus.set(cle, `${relative(racine, fichier)}:${ligne}`)
  }
  for (const m of texte.matchAll(gabarit)) gabarits.push(`${relative(racine, fichier)}:${texte.slice(0, m.index).split('\n').length}`)
}

const manquants = [...vus].filter(([cle]) => !(cle in EN))
const inutiles = Object.keys(EN).filter((cle) => !vus.has(cle))
const variables = [...vus].filter(([cle]) => cle in EN && JSON.stringify(cle.match(/\{\w+\}/g)?.sort()) !== JSON.stringify(EN[cle].match(/\{\w+\}/g)?.sort()))

console.log(`${vus.size} textes, ${Object.keys(EN).length} traductions`)
for (const [cle, ou] of manquants) console.log(`MANQUANT  ${ou}  ${JSON.stringify(cle)}`)
for (const [cle, ou] of variables) console.log(`VARIABLES ${ou}  ${JSON.stringify(cle)}`)
for (const ou of gabarits) console.log(`GABARIT   ${ou}  (écrire t('… {x} …', { x }))`)
for (const cle of inutiles) console.log(`INUTILE   ${JSON.stringify(cle)}`)
process.exit(manquants.length || variables.length || gabarits.length ? 1 : 0)

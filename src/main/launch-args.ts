/**
 * Fichiers et adresses passés à Kaze en ligne de commande : « Ouvrir avec Kaze » sur un .html
 * du Bureau, double-clic quand Kaze est l'application par défaut, ou lien http(s).
 *
 * Windows lance Kaze avec le chemin du fichier en argument. Si Kaze tourne déjà, c'est la
 * seconde instance qui le reçoit ; elle transmet sa ligne de commande à la première (évènement
 * « second-instance ») puis se ferme.
 */
import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Ce que Kaze sait afficher lui-même (pages web, images vectorielles, PDF). */
const OPENABLE = new Set(['.html', '.htm', '.xhtml', '.shtml', '.svg', '.pdf'])

/** Adresses à ouvrir dans des onglets, dans l'ordre reçu (le programme et les options ignorés). */
export function urlsFromArgs(argv: string[], cwd: string): string[] {
  const urls: string[] = []
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    if (/^https?:\/\//i.test(arg)) {
      urls.push(arg)
      continue
    }
    const path = resolve(cwd, arg)
    if (!OPENABLE.has(extname(path).toLowerCase())) continue
    try {
      if (existsSync(path) && statSync(path).isFile()) urls.push(pathToFileURL(path).href)
    } catch {
      // Fichier illisible : ignoré.
    }
  }
  return urls
}

/**
 * Signature VMP de castLabs (étape « afterSign » d'electron-builder).
 *
 * Widevine fonctionne sans elle pour beaucoup de sites, mais Netflix, Spotify, Disney+…
 * exigent que le navigateur soit signé VMP (Verified Media Path). castLabs le fait
 * gratuitement avec son service EVS, après création d'un compte (une seule fois) :
 *
 *   py -m pip install --upgrade castlabs-evs
 *   py -m castlabs_evs.account signup      (ou « reauth » si le compte existe déjà)
 *
 * Ensuite, chaque `npm run dist` / `npm run release` signe Kaze ici. Sous Windows, castLabs
 * exige la signature VMP APRÈS toute modification de l'exe : icône et version (rcedit) puis
 * signature Authenticode éventuelle. Signer avant (afterPack) donne une signature invalide.
 * Sans Python ou sans compte,
 * l'installateur est produit quand même, avec un avertissement.
 * Mettre KAZE_VMP=obligatoire pour refuser un installateur non signé VMP.
 */
const { spawnSync } = require('node:child_process')

/** Python : KAZE_PYTHON s'il est donné (machines de GitHub), sinon le lanceur « py » de Windows, sinon « python ». */
function findPython() {
  for (const command of process.env.KAZE_PYTHON ? [process.env.KAZE_PYTHON] : ['py', 'python']) {
    const probe = spawnSync(command, ['-c', 'import castlabs_evs'], { encoding: 'utf8', shell: false })
    if (probe.status === 0) return { command, evs: true }
    if (probe.status !== null && !probe.error && /castlabs_evs/.test(probe.stderr)) return { command, evs: false }
  }
  return null
}

exports.default = async function vmp(context) {
  const required = process.env.KAZE_VMP === 'obligatoire'
  const problem = (message) => {
    if (required) throw new Error(`Signature VMP impossible : ${message}`)
    console.warn(`  • Attention : Kaze n'est PAS signé VMP (${message}). Netflix et Spotify refuseront la lecture.`)
  }
  const python = findPython()
  if (!python) return problem('Python introuvable')
  if (!python.evs) return problem('module castlabs-evs absent : py -m pip install castlabs-evs')

  console.log(`  • signature VMP castLabs  dossier=${context.appOutDir}`)
  // -n (non interactif) : si la session castLabs a expiré, l'outil demanderait le mot de passe
  // dans une console invisible et la publication resterait bloquée. Là, il échoue aussitôt.
  const result = spawnSync(python.command, ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', context.appOutDir], { stdio: ['ignore', 'inherit', 'inherit'], shell: false })
  if (result.status !== 0) return problem(`castlabs_evs a échoué (code ${result.status}) : session castLabs expirée ? Lancez « py -m castlabs_evs.account reauth » puis republiez`)
}

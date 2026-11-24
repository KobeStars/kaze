# Développer Kaze

Kaze est construit avec Electron (version castLabs, pour Widevine), TypeScript, Vite (electron-vite) et React.
Il se développe et se compile sous Windows 10 ou 11, avec Node.js 22 ou plus récent.

## Démarrer

```bash
npm install          # installe aussi le binaire Electron (postinstall)
npm run dev          # interface avec rechargement à chaud
npm run build        # vérification des types + compilation dans out/
npm run preview      # lance la version compilée
npm run dist         # installateur Windows : dist/Kaze-Setup-<version>.exe
```

Autres scripts :

- `npm run typecheck` : vérifie les traductions puis les types (processus principal, preloads, interface).
- `npm run i18n` : vérifie que chaque texte de l'interface a sa traduction anglaise.
- `npm run tor` : télécharge le Tor Expert Bundle officiel (version et SHA-256 figées dans `scripts/tor.mjs`) dans `resources/tor`. `npm run dist` le lance tout seul.
- `npm run logo` : détoure `assets/logo/kaze-logo.(png|jpg|webp)` et génère toutes les icônes.
- `npm run polices` : extrait de Shippori Mincho uniquement les kanji utilisés (≈ 500 Ko au lieu de 11 Mo).
- `npm run release` : publie une version sur GitHub (réservé au mainteneur : signature et compte castLabs).

Pour tester sans toucher à votre profil : `KAZE_PROFIL=C:\chemin\profil-test` (variable d'environnement)
envoie toutes les données (favoris, historique, cookies) dans ce dossier.

### Netflix, Spotify et la signature VMP

Widevine est fourni par l'Electron de castLabs, mais Netflix et Spotify exigent en plus une signature VMP.
Après la compilation, `scripts/vmp.cjs` signe l'application avec `castlabs-evs` s'il le trouve (compte gratuit chez castLabs :
`py -m pip install castlabs-evs`, puis `py -m castlabs_evs.account signup`). Sans lui, l'installateur se construit
quand même ; seuls les contenus protégés refuseront de se lire.

## Architecture

```
src/
  main/                   processus principal (Node)
    index.ts              démarrage, sessions, instance unique, fichiers ouverts avec Kaze
    window.ts             fenêtre sans cadre
    protocol.ts           protocole kaze:// (interface + pages internes)
    security.ts           garde-fous globaux
    store.ts              stockage JSON atomique (%APPDATA%\Kaze)
    launch-args.ts        fichiers et adresses reçus au lancement
    browser/
      controller.ts       source de vérité : onglets, Courants, split, panneau, Brise, raccourcis
      tab.ts              un onglet = une WebContentsView
      menus.ts            menus contextuels natifs
    services/             paramètres, historique, favoris, téléchargements, Bouclier, Tempête,
                          permissions, Brume (vpn.ts), mode responsive, extensions Chrome,
                          identité Chrome (connexion Google), mises à jour
    studio/               Kaze Studio : serveur d'aperçu local (jeton) et projets
    ipc/
      router.ts           IPC typé : vérification de l'expéditeur + validation zod
      handlers.ts         branchement de tous les canaux
  preload/
    index.ts              pont de l'interface (contextBridge)
    interne.ts            pont des pages internes (kaze://)
    miroir.ts             synchronisation du mode responsive (défilement, clics, saisie)
    extensions.ts         API Chrome manquantes pour les extensions
  shared/                 types, contrat IPC (zod), paramètres, URL, raccourcis,
                          thèmes, templates, fonds d'accueil, appareils du mode responsive
  renderer/
    index.html            interface du navigateur (React)
    interne.html          pages internes : accueil, bienvenue (React + canvas)
    src/ui/               composants de l'interface
    src/interne/          page d'accueil et paysage animé
    src/styles/           jetons de couleur, styles
assets/logo/              logo source
build/                    icônes générées (icon.ico, icons/*.png)
scripts/                  logo, polices, Tor, signature VMP, publication
site/                     page de présentation (GitHub Pages)
```

### Choix techniques

- **React plutôt que vanilla TS** : l'interface a beaucoup d'état partagé (onglets, Courants, palette,
  tiroirs, paramètres). React + `useSyncExternalStore` suffit, sans bibliothèque d'état.
- **Le processus principal est la source de vérité** : il diffuse l'état complet (`browser:state`), l'interface
  l'affiche et envoie des commandes. Pas de double état à synchroniser.
- **Pages dans des WebContentsView** placées par le principal dans les zones que l'interface mesure.
  Les vues passant toujours au-dessus de l'interface, les fenêtres flottantes (Souffle, paramètres,
  suggestions) « figent » les pages : capture affichée, vraies vues retirées le temps de l'affichage.
- **Sécurité** : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, CSP stricte, protocole `kaze://`
  au lieu de `file://`, chaque message IPC vérifié (expéditeur + arguments zod), `<webview>` interdit,
  les pages web ne peuvent pas ouvrir de page interne, permissions des sites demandées et mémorisées.
- **Stockage JSON** plutôt que SQLite : volumes faibles, aucun module natif à recompiler pour Electron.
- **Bouclier** : moteur `@ghostery/adblocker` (syntaxe EasyList), listes mises en cache et rafraîchies chaque
  semaine ; Kaze garde la main sur les requêtes pour compter par onglet et autoriser site par site.
- **Brume** : le proxy SOCKS de Tor est posé sur la session *avant* le démarrage de Tor, pour que rien ne sorte
  avec la vraie adresse si Tor n'est pas prêt ou décroche.
- **Mode responsive** : émulation par `Emulation.setDeviceMetricsOverride` (protocole DevTools), avec
  `scale` = largeur de l'emplacement / largeur de l'appareil.
- **Extensions** : `session.extensions` d'Electron, complété par un preload qui ajoute les API Chrome absentes
  et renvoie les vrais onglets de Kaze à `chrome.tabs`.

## Traduction

Kaze est en français et en anglais (Paramètres → Général → Langue ; « Comme Windows » par défaut).
Le français est la langue source : chaque texte s'écrit en français dans le code, entouré de `t('…')`
(`src/shared/i18n.ts`), et sert de clé dans le dictionnaire anglais `src/shared/i18n-en.ts`.

- Variables : `t('{n} onglets', { n })`, avec les mêmes `{n}` dans la traduction.
- Listes définies au chargement d'un module : dans les pages, `t()` marche directement (la langue est
  réglée avant tout autre module, voir `src/renderer/src/commun/langue.ts`) ; dans le processus principal,
  marquer le texte avec `N_('…')` et le traduire à l'usage avec `t(texte)`.
- Changer de langue recharge l'interface et les pages internes.
- `npm run i18n` signale les textes sans traduction, les variables qui ne correspondent pas et les
  entrées inutiles. `KAZE_AUTOTEST_LANGUE=1` (profil réglé en anglais) relève tous les textes affichés
  et signale ceux qui ont l'air français.
- L'installateur suit la langue de Windows ; sa page de licence est dans `build/license_en.txt` et
  `build/license_fr.txt`.

## Publier une version

Les versions publiques sont construites par GitHub Actions ([`.github/workflows/publier.yml`](../.github/workflows/publier.yml)) :

```bash
npm version patch                       # 0.2.15 → 0.2.16 : commit + tag v0.2.16
git push origin main --follow-tags      # le tag lance la construction
git push nas main
```

Le workflow construit Kaze sur une machine Windows de GitHub, le signe VMP (compte castLabs dans les secrets
`EVS_ACCOUNT_NAME` / `EVS_PASSWD`) puis crée la release. La signature [SignPath](https://signpath.org/) est prête
mais pas encore active (Kaze n'a pas encore été accepté par SignPath Foundation) : elle s'enclenche quand les
variables `SIGNPATH_*` existent. L'installateur part alors à SignPath (la demande se valide à la main sur
app.signpath.io), puis `latest.yml` et le `.blockmap` du fichier signé sont recalculés (`scripts/apres-signature.mjs`). Lancé à la main depuis l'onglet Actions, il construit
seulement, sans rien publier. La configuration d'artefact SignPath est dans [`.signpath/`](../.signpath/artifact-configuration.xml).

`npm run release` publie encore depuis le PC du mainteneur, sans signature SignPath.

## Tests automatiques

`KAZE_AUTOTEST=<dossier>` lance Kaze dans une fenêtre cachée, déroule un scénario et écrit des captures et un
`rapport.txt` dans ce dossier (version de développement uniquement). Scénarios : ajouter `KAZE_AUTOTEST_VPN=1`,
`_DRM`, `_RESPONSIVE`, `_OUVRIR`, `_TEMPLATES`, `_FONDS`, `_EXT`, `_LANGUE` ou `_VITRINE` ; `KAZE_AUTOTEST_VISIBLE=1` affiche la fenêtre.

## Limites connues

- Kaze ne s'enregistre pas encore comme navigateur par défaut de Windows.
- L'installateur n'est pas signé : Windows SmartScreen affiche un avertissement au premier lancement.
- NSIS ne gère pas les chemins très longs : si `npm run dist` échoue sur un `!include`, placez le projet
  dans un dossier au chemin court.

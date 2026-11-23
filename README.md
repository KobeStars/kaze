# Kaze 風

> « Navigue comme le vent » — Léger. Rapide. Libre. Le web, sans résistance.

Navigateur web pour Windows, à l'identité japonaise, construit avec Electron 45, TypeScript, Vite et React.
Conçu par Kordix Studio.

## Démarrer

```bash
npm install          # installe aussi le binaire Electron (postinstall)
npm run dev          # interface avec rechargement à chaud
npm run build        # vérification des types + compilation dans out/
npm run preview      # lance la version compilée
npm run dist         # installateur Windows : dist/Kaze-Setup-<version>.exe
```

Autres scripts :

- `npm run typecheck` : vérifie les types (processus principal, preloads, interface).
- `npm run logo` : détoure `assets/logo/kaze-logo.(png|jpg|webp)` et génère toutes les icônes.
- `npm run polices` : extrait de Shippori Mincho uniquement les kanji utilisés (≈ 500 Ko au lieu de 11 Mo).

Pour tester sans toucher à votre profil : `KAZE_PROFIL=C:\chemin\profil-test` (variable d'environnement)
envoie toutes les données (favoris, historique, cookies) dans ce dossier.

## Fonctionnalités

| | |
|---|---|
| Fenêtre | Sans cadre, barre de titre maison, boutons Windows 11 (Fermer en vermillon) |
| Onglets | Verticaux repliables (défaut) ou horizontaux ; glisser-déposer, clic molette, menu clic droit |
| Barre d'adresse | Adresse ou recherche (Google, DuckDuckGo, Brave), suggestions onglets / favoris / historique |
| Favoris, historique, téléchargements | Tiroir latéral avec recherche ; téléchargements avec pause, reprise, annulation |
| **Souffle** (Ctrl+K) | Palette de commandes : sites, onglets, historique, actions |
| **Courants** | Espaces de travail avec leurs onglets, nom, couleur et icône kanji |
| **Bouclier de vent** | Bloqueur pubs + traqueurs (EasyList / EasyPrivacy via le moteur Ghostery), compteur, désactivable par site |
| **Brise** | Met en veille les onglets inactifs (page déchargée de la mémoire) |
| **Tempête** | Mode focus : bloque une liste de sites pendant une durée choisie (survit au redémarrage) |
| Split view | Deux pages côte à côte, séparation réglable (Ctrl+Maj+S) |
| Panneau latéral | Web apps épinglées (Discord, Spotify, Claude…) |
| Accueil | Paysage animé (bambous au vent, lune ou soleil-sceau), horloge, recherche, raccourcis favoris |
| Paramètres | Thème sombre / clair / Windows, moteur, page d'accueil, Brise, Tempête, raccourcis modifiables… |

## Raccourcis

Ctrl+T nouvel onglet · Ctrl+W fermer · Ctrl+Maj+T rouvrir · Ctrl+L adresse · Ctrl+K Souffle ·
Ctrl+Tab / Ctrl+Maj+Tab onglet suivant / précédent · Ctrl+1…9 aller à l'onglet · F5 / Ctrl+R recharger ·
Ctrl+F5 sans cache · F12 DevTools · Ctrl+D favori · Ctrl+H historique · Ctrl+J téléchargements ·
Ctrl+F rechercher dans la page · Ctrl+B barre latérale · Ctrl+Maj+S split view · Ctrl+, paramètres ·
Alt+← / Alt+→ navigation · Ctrl+= / Ctrl+- / Ctrl+0 zoom · F11 plein écran.
Tous modifiables dans Paramètres → Raccourcis.

## Architecture

```
src/
  main/                 processus principal (Node)
    index.ts            démarrage, sessions, instance unique
    window.ts           fenêtre frameless
    protocol.ts         protocole kaze:// (interface + page d'accueil)
    security.ts         garde-fous globaux, agent utilisateur
    store.ts            stockage JSON atomique (%APPDATA%\Kaze)
    browser/
      controller.ts     source de vérité : onglets, Courants, split, panneau, Brise, raccourcis
      tab.ts            un onglet = une WebContentsView
      menus.ts          menus contextuels natifs
    services/           paramètres, historique, favoris, téléchargements,
                        Bouclier, Tempête, permissions des sites
    ipc/
      router.ts         IPC typé : vérification de l'expéditeur + validation zod
      handlers.ts       branchement de tous les canaux
  preload/
    index.ts            pont de l'interface (contextBridge)
    interne.ts          pont de la page d'accueil (kaze://accueil uniquement)
  shared/               types, contrat IPC (zod), paramètres, URL, raccourcis
  renderer/
    index.html          interface du navigateur (React)
    interne.html        page d'accueil (React + canvas)
    src/ui/             composants de l'interface
    src/interne/        page d'accueil et paysage animé
    src/styles/         jetons de couleur, styles
assets/logo/            logo source
build/                  icônes générées (icon.ico, icons/*.png)
scripts/                logo.mjs, polices-jp.mjs
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

## Logo

`npm run logo` détoure automatiquement le logo officiel (papier washi rendu transparent, slogan retiré)
et produit : versions encre / washi pour l'interface, icônes 16 → 256 px (kanji seul jusqu'à 32 px),
`build/icon.ico` et `build/icon.png`. Si le résultat d'un nouveau logo ne convient pas, détourez-le à la
main : Photopea (gratuit, en ligne) ou Photoshop → Sélection → Plage de couleurs sur le papier → Supprimer,
puis exportez en PNG transparent sous `assets/logo/kaze-logo.png` et relancez `npm run logo`.

## Limites connues

- Pas de Widevine (DRM) dans Electron : Netflix ne marche pas, Spotify web refuse de lire la musique.
  Solution possible : la version Electron de castLabs (ECS).
- Kaze ne s'enregistre pas encore comme navigateur par défaut de Windows.
- L'installateur n'est pas signé : Windows SmartScreen affichera un avertissement au premier lancement.
- NSIS ne gère pas les chemins très longs : si `npm run dist` échoue sur un `!include`, placez le projet
  dans un dossier au chemin court.

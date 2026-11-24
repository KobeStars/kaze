/**
 * Modèles prêts à l'emploi de Kaze Studio. Les « $1, $2… » sont les emplacements que
 * Tab fait parcourir après l'insertion, « $0 » la position finale du curseur.
 */
import type { Snippet } from '@shared/settings'
import { t } from '@shared/i18n'

export const BUILTIN_SNIPPETS: Snippet[] = [
  {
    id: 'page',
    name: t('Page HTML de base'),
    language: 'html',
    body: `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>\${1:Titre}</title>
    <link rel="stylesheet" href="\${2:style.css}" />
  </head>
  <body>
    $0
    <script type="module" src="\${3:script.js}"></script>
  </body>
</html>`
  },
  {
    id: 'navbar',
    name: t('Barre de navigation'),
    language: 'html',
    body: `<header class="navbar">
  <a class="navbar__logo" href="/">\${1:Kaze}</a>
  <nav class="navbar__liens">
    <a href="#accueil">Accueil</a>
    <a href="#services">Services</a>
    <a href="#contact">Contact</a>
  </nav>
</header>
<style>
  .navbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; }
  .navbar__logo { font-weight: 700; text-decoration: none; color: inherit; }
  .navbar__liens { display: flex; gap: 20px; }
  .navbar__liens a { color: inherit; text-decoration: none; opacity: .8; }
  .navbar__liens a:hover { opacity: 1; }
</style>$0`
  },
  {
    id: 'grille',
    name: t('Grille de cartes'),
    language: 'html',
    body: `<section class="grille">
  <article class="carte">
    <h3>\${1:Titre}</h3>
    <p>\${2:Description courte.}</p>
  </article>
  <article class="carte"><h3>Titre</h3><p>Description courte.</p></article>
  <article class="carte"><h3>Titre</h3><p>Description courte.</p></article>
</section>
<style>
  .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding: 24px; }
  .carte { padding: 20px; border-radius: 14px; background: #fff; box-shadow: 0 4px 20px rgb(0 0 0 / .08); }
</style>$0`
  },
  {
    id: 'formulaire',
    name: t('Formulaire de contact'),
    language: 'html',
    body: `<form class="formulaire">
  <label>Nom <input name="nom" required /></label>
  <label>E-mail <input name="email" type="email" required /></label>
  <label>Message <textarea name="message" rows="5"></textarea></label>
  <button type="submit">\${1:Envoyer}</button>
</form>
<style>
  .formulaire { display: grid; gap: 12px; max-width: 420px; }
  .formulaire label { display: grid; gap: 4px; font-size: 14px; }
  .formulaire input, .formulaire textarea { padding: 10px 12px; border-radius: 8px; border: 1px solid #ccc; font: inherit; }
  .formulaire button { padding: 10px; border: 0; border-radius: 8px; background: #d7372a; color: #fff; font: inherit; }
</style>$0`
  },
  {
    id: 'hero',
    name: t('Section d’accroche (hero)'),
    language: 'html',
    body: `<section class="hero">
  <h1>\${1:Navigue comme le vent}</h1>
  <p>\${2:Une phrase qui donne envie d’en savoir plus.}</p>
  <a class="hero__bouton" href="#">\${3:Commencer}</a>
</section>
<style>
  .hero { min-height: 70vh; display: grid; place-content: center; text-align: center; gap: 16px; padding: 32px; }
  .hero h1 { font-size: clamp(32px, 6vw, 64px); margin: 0; }
  .hero__bouton { justify-self: center; padding: 12px 22px; border-radius: 999px; background: #111; color: #fff; text-decoration: none; }
</style>$0`
  },
  {
    id: 'flex-centre',
    name: t('Centrer avec flexbox'),
    language: 'css',
    body: `\${1:.conteneur} {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}$0`
  },
  {
    id: 'grid-responsive',
    name: t('Grille responsive'),
    language: 'css',
    body: `\${1:.grille} {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(\${2:240px}, 1fr));
  gap: \${3:16px};
}$0`
  },
  {
    id: 'media',
    name: t('Media query mobile'),
    language: 'css',
    body: `@media (max-width: \${1:640px}) {
  $0
}`
  },
  {
    id: 'theme-sombre',
    name: t('Thème sombre automatique'),
    language: 'css',
    body: `:root {
  --fond: #f5f2eb;
  --texte: #111111;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fond: #111111;
    --texte: #f5f2eb;
  }
}

body {
  background: var(--fond);
  color: var(--texte);
}$0`
  },
  {
    id: 'fetch',
    name: t('Charger du JSON (fetch)'),
    language: 'javascript',
    body: `const reponse = await fetch('\${1:donnees.json}')
const \${2:donnees} = await reponse.json()
console.log(\${2:donnees})$0`
  },
  {
    id: 'evenement',
    name: t('Écouter un clic'),
    language: 'javascript',
    body: `document.querySelector('\${1:button}').addEventListener('click', (event) => {
  $0
})`
  },
  {
    id: 'dom-pret',
    name: t('Quand la page est prête'),
    language: 'javascript',
    body: `document.addEventListener('DOMContentLoaded', () => {
  $0
})`
  }
]

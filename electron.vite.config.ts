/**
 * Configuration electron-vite : un seul fichier pour les trois cibles.
 *  - main     : processus principal (Node), sortie CommonJS dans out/main
 *  - preload  : deux ponts sécurisés (interface + pages internes), sortie dans out/preload
 *  - renderer : interface React (index.html) + pages internes kaze:// (interne.html)
 */
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = { '@shared': resolve('src/shared') }

/**
 * Politique de sécurité du contenu (CSP) des pages de Kaze, stricte en production.
 * En développement, Vite a besoin de scripts et de styles en ligne (React Refresh,
 * injection CSS) et d'un WebSocket pour le rechargement à chaud.
 * kaze: autorise les fichiers perso (polices, images, vidéos) servis par le protocole interne.
 */
function csp(page: string, dev: boolean): string {
  const studio = page.includes('studio')
  const rules = [
    "default-src 'none'",
    `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    // Monaco (Studio) crée ses styles à la volée : 'unsafe-inline' n'est accordé qu'à Studio.
    `style-src 'self'${dev || studio ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data: blob: https: http: kaze:",
    "media-src 'self' kaze: blob:",
    "font-src 'self' data: kaze:",
    `connect-src 'self' kaze:${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'"
  ]
  if (studio) {
    rules.push("worker-src 'self' blob:")
    // L'aperçu du projet vient du mini serveur local de Studio.
    rules.push('frame-src http://127.0.0.1:*')
  }
  return rules.join('; ')
}

/** Remplace le commentaire <!-- kaze:csp --> des pages HTML par la balise CSP adaptée. */
function cspKaze(): Plugin {
  return {
    name: 'kaze-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const politique = csp(ctx.filename || ctx.path, Boolean(ctx.server))
        return html.replace('<!-- kaze:csp -->', `<meta http-equiv="Content-Security-Policy" content="${politique}" />`)
      }
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias },
    build: {
      // Chaque preload doit être un fichier autonome : en mode sandbox, il ne peut pas
      // charger d'autres fichiers JS (seul `electron` est disponible).
      isolatedEntries: true,
      externalizeDeps: false,
      rolldownOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          interne: resolve('src/preload/interne.ts'),
          // Vues du mode responsive (Éventail) : synchronisation entre appareils.
          miroir: resolve('src/preload/miroir.ts'),
          // Extensions Chrome : fonctions de Chrome absentes d'Electron.
          extensions: resolve('src/preload/extensions.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: { ...alias, '@renderer': resolve('src/renderer/src') }
    },
    plugins: [react(), cspKaze()],
    worker: { format: 'es' },
    build: {
      minify: true,
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          interne: resolve('src/renderer/interne.html'),
          studio: resolve('src/renderer/studio.html')
        }
      }
    }
  }
})

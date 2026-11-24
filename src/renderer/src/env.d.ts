/// <reference types="vite/client" />
import type { KazeApi, KazeBienvenueApi, KazeInterneApi, KazeStudioApi } from '@shared/api'

declare global {
  interface Window {
    /** API de l'interface, exposée par src/preload/index.ts */
    kaze: KazeApi
    /** API de la page d'accueil, exposée par src/preload/interne.ts */
    kazeInterne?: KazeInterneApi
    /** Langue de Kaze, exposée aux pages internes. */
    kazeLang?: 'fr' | 'en'
    /** API de Kaze Studio, exposée par src/preload/interne.ts */
    kazeStudio?: KazeStudioApi
    /** API de la page de bienvenue, exposée par src/preload/interne.ts */
    kazeBienvenue?: KazeBienvenueApi
  }
}

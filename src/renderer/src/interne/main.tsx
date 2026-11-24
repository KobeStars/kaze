/**
 * Point d'entrée des pages internes servies par interne.html :
 *  - kaze://accueil   → la page d'accueil (nouvel onglet)
 *  - kaze://bienvenue → la page de bienvenue du premier lancement
 */
import '../commun/langue' // en premier : la langue avant tous les autres modules
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { t } from '@shared/i18n'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/shippori-mincho/latin-500.css'
import '@fontsource/shippori-mincho/latin-700.css'
import '../styles/polices-jp.css'
import '../styles/tokens.css'
import './accueil.css'
import './bienvenue.css'
import { Accueil } from './Accueil'
import { Bienvenue } from './Bienvenue'

const welcome = location.hostname === 'bienvenue'
if (welcome) {
  document.title = t('Bienvenue dans Kaze')
  document.documentElement.classList.add('bienvenue')
} else {
  document.title = t('Nouvel onglet')
}

createRoot(document.getElementById('root')!).render(<StrictMode>{welcome ? <Bienvenue /> : <Accueil />}</StrictMode>)

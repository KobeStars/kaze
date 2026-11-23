/**
 * Point d'entrée des pages internes servies par interne.html :
 *  - kaze://accueil   → la page d'accueil (nouvel onglet)
 *  - kaze://bienvenue → la page de bienvenue du premier lancement
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
  document.title = 'Bienvenue dans Kaze'
  document.documentElement.classList.add('bienvenue')
}

createRoot(document.getElementById('root')!).render(<StrictMode>{welcome ? <Bienvenue /> : <Accueil />}</StrictMode>)

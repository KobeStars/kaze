/**
 * Point d'entrée de Kaze Studio (kaze://studio).
 */
import '../commun/langue' // en premier : la langue avant tous les autres modules
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '../styles/polices-jp.css'
import '../styles/tokens.css'
import './studio.css'
import { Studio } from './Studio'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Studio />
  </StrictMode>
)

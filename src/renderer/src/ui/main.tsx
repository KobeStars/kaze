/**
 * Point d'entrée de l'interface du navigateur (kaze://app).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/shippori-mincho/latin-500.css'
import '@fontsource/shippori-mincho/latin-700.css'
import '../styles/polices-jp.css'
import '../styles/tokens.css'
import '../styles/app.css'
import { App } from './App'
import { connectStores } from './store'

connectStores()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

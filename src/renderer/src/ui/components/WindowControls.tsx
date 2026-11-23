/**
 * Boutons de fenêtre façon Windows 11 (police d'icônes Segoe Fluent Icons).
 * Fermer passe au vermillon du sceau au survol.
 */
import type { JSX } from 'react'
import { kaze, useStore, windowStore } from '../store'

export function WindowControls(): JSX.Element {
  const { maximized } = useStore(windowStore)
  return (
    <div className="window-controls">
      <button type="button" title="Réduire" aria-label="Réduire" onClick={() => void kaze.invoke('window:minimize')}>
        {''}
      </button>
      <button
        type="button"
        title={maximized ? 'Restaurer' : 'Agrandir'}
        aria-label={maximized ? 'Restaurer' : 'Agrandir'}
        onClick={() => void kaze.invoke('window:toggle-maximize')}
      >
        {maximized ? '' : ''}
      </button>
      <button type="button" className="window-controls__close" title="Fermer" aria-label="Fermer" onClick={() => void kaze.invoke('window:close')}>
        {''}
      </button>
    </div>
  )
}

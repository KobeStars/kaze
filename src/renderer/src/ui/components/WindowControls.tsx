/**
 * Boutons de fenêtre façon Windows 11 (police d'icônes Segoe Fluent Icons).
 * Fermer passe au vermillon du sceau au survol.
 */
import type { JSX } from 'react'
import { kaze, useStore, windowStore } from '../store'
import { t } from '@shared/i18n'

export function WindowControls(): JSX.Element {
  const { maximized } = useStore(windowStore)
  return (
    <div className="window-controls">
      <button type="button" title={t('Réduire')} aria-label={t('Réduire')} onClick={() => void kaze.invoke('window:minimize')}>
        {''}
      </button>
      <button
        type="button"
        title={maximized ? t('Restaurer') : t('Agrandir')}
        aria-label={maximized ? t('Restaurer') : t('Agrandir')}
        onClick={() => void kaze.invoke('window:toggle-maximize')}
      >
        {maximized ? '' : ''}
      </button>
      <button type="button" className="window-controls__close" title={t('Fermer')} aria-label={t('Fermer')} onClick={() => void kaze.invoke('window:close')}>
        {''}
      </button>
    </div>
  )
}

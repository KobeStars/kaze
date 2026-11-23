/**
 * Mises à jour : bouton « Mise à jour prête » dans la barre de titre, et rubrique des
 * paramètres (état, vérification manuelle, interrupteur automatique).
 */
import type { JSX } from 'react'
import type { UpdateState } from '@shared/types'
import { kaze, settingsStore, updateSettings, updateStore, useStore } from '../store'
import { Icon } from './Icon'
import { Row, Toggle } from './settings/controls'

const TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function describe(u: UpdateState): string {
  switch (u.status) {
    case 'desactive':
      return 'Version de développement : les mises à jour ne s’appliquent qu’à Kaze installé.'
    case 'attente':
      return 'Première vérification dans quelques secondes.'
    case 'recherche':
      return 'Recherche d’une nouvelle version…'
    case 'a-jour':
      return `Kaze est à jour${u.checkedAt ? ` (vérifié le ${TIME.format(u.checkedAt)})` : ''}.`
    case 'telechargement':
      return `Téléchargement de la version ${u.available ?? ''} : ${u.progress} %`
    case 'pret':
      return `La version ${u.available ?? ''} est prête : elle s’installera au prochain démarrage.`
    case 'erreur':
      return `Vérification impossible : ${u.error ?? 'erreur inconnue'}`
  }
}

/** Bouton discret dans la barre de titre, visible seulement quand une mise à jour est prête. */
export function UpdateReady(): JSX.Element | null {
  const update = useStore(updateStore)
  if (update?.status !== 'pret') return null
  return (
    <button
      type="button"
      className="update-ready"
      title={`Kaze ${update.available} est prêt — cliquer pour redémarrer et l’installer (vos onglets seront rouverts)`}
      onClick={() => void kaze.invoke('update:install')}
    >
      <Icon name="download" size={14} /> Mettre à jour
    </button>
  )
}

/** Rubrique « Mises à jour » des paramètres. */
export function UpdatesSettings(): JSX.Element {
  const update = useStore(updateStore)
  const settings = useStore(settingsStore)
  if (!update || !settings) return <></>
  const busy = update.status === 'recherche' || update.status === 'telechargement'
  return (
    <div className="updates">
      <Row label="Mises à jour automatiques" hint="Kaze vérifie toutes les 4 heures, télécharge en arrière-plan et installe au redémarrage.">
        <Toggle label="Mises à jour automatiques" checked={settings.autoUpdate} onChange={(v) => updateSettings({ autoUpdate: v })} />
      </Row>
      <Row label={`Version installée : ${update.current}`} hint={describe(update)}>
        {update.status === 'pret' ? (
          <button type="button" className="btn btn--s btn--primary" onClick={() => void kaze.invoke('update:install')}>
            Redémarrer et mettre à jour
          </button>
        ) : (
          <button type="button" className="btn btn--s" disabled={busy || update.status === 'desactive'} onClick={() => void kaze.invoke('update:check')}>
            <Icon name="reload" size={14} /> Rechercher
          </button>
        )}
      </Row>
      {update.status === 'telechargement' && (
        <div className="download__bar updates__bar">
          <span style={{ width: `${update.progress}%` }} />
        </div>
      )}
    </div>
  )
}

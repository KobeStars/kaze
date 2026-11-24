/**
 * Mises à jour : bouton « Mise à jour prête » dans la barre de titre, et rubrique des
 * paramètres (état, vérification manuelle, interrupteur automatique).
 */
import type { JSX } from 'react'
import type { UpdateState } from '@shared/types'
import { kaze, settingsStore, updateSettings, updateStore, useStore } from '../store'
import { Icon } from './Icon'
import { Row, Toggle } from './settings/controls'
import { locale, t } from '@shared/i18n'

const TIME = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function describe(u: UpdateState): string {
  switch (u.status) {
    case 'desactive':
      return t('Version de développement : les mises à jour ne s’appliquent qu’à Kaze installé.')
    case 'attente':
      return t('Première vérification dans quelques secondes.')
    case 'recherche':
      return t('Recherche d’une nouvelle version…')
    case 'a-jour':
      return u.checkedAt ? t('Kaze est à jour (vérifié le {date}).', { date: TIME.format(u.checkedAt) }) : t('Kaze est à jour.')
    case 'telechargement':
      return t('Téléchargement de la version {version} : {n} %', { version: u.available ?? '', n: u.progress })
    case 'pret':
      return t('La version {version} est prête : elle s’installera au prochain démarrage.', { version: u.available ?? '' })
    case 'erreur':
      return t('Vérification impossible : {erreur}', { erreur: u.error ?? t('erreur inconnue') })
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
      title={t('Kaze {version} est prêt — cliquer pour redémarrer et l’installer (vos onglets seront rouverts)', { version: update.available ?? '' })}
      onClick={() => void kaze.invoke('update:install')}
    >
      <Icon name="download" size={14} /> {t('Mettre à jour')}
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
      <Row label={t('Mises à jour automatiques')} hint={t('Kaze vérifie toutes les 4 heures, télécharge en arrière-plan et installe au redémarrage.')}>
        <Toggle label={t('Mises à jour automatiques')} checked={settings.autoUpdate} onChange={(v) => updateSettings({ autoUpdate: v })} />
      </Row>
      <Row label={t('Version installée : {version}', { version: update.current })} hint={describe(update)}>
        {update.status === 'pret' ? (
          <button type="button" className="btn btn--s btn--primary" onClick={() => void kaze.invoke('update:install')}>
            {t('Redémarrer et mettre à jour')}
          </button>
        ) : (
          <button type="button" className="btn btn--s" disabled={busy || update.status === 'desactive'} onClick={() => void kaze.invoke('update:check')}>
            <Icon name="reload" size={14} /> {t('Rechercher')}
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

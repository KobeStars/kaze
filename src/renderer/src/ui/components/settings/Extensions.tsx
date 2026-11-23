/**
 * Paramètres → Extensions : extensions Chrome installées depuis le Chrome Web Store ou un
 * dossier. Le processus principal télécharge, décompresse et charge ; ici on liste et règle.
 */
import { useState, type FormEvent, type JSX } from 'react'
import { extensionsStore, kaze, useStore } from '../../store'
import { Icon } from '../Icon'
import { Block, SectionTitle, Toggle } from './controls'

export function ExtensionsSection(): JSX.Element {
  const list = useStore(extensionsStore)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (task: () => Promise<{ name: string } | null>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const added = await task()
      if (added) setMessage({ ok: true, text: `« ${added.name} » est installée.` })
      setInput('')
    } catch (error) {
      setMessage({ ok: false, text: String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    } finally {
      setBusy(false)
    }
  }
  const install = (event: FormEvent): void => {
    event.preventDefault()
    if (input.trim()) void run(() => kaze.invoke('ext:install', input.trim()))
  }

  return (
    <>
      <SectionTitle>Extensions</SectionTitle>
      <p className="settings__intro">
        Les extensions Chrome s’installent depuis le Chrome Web Store : collez le lien de la page de l’extension. Kaze fait tourner
        celles qui agissent dans les pages (thème sombre, traduction, outils de développement…) ; certaines fonctions avancées de
        Chrome ne sont pas encore disponibles.
      </p>

      <form className="ext-install" onSubmit={install}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://chromewebstore.google.com/detail/…"
          aria-label="Lien ou identifiant du Chrome Web Store"
          spellCheck={false}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !input.trim()}>
          {busy ? 'Installation…' : 'Installer'}
        </button>
      </form>
      <div className="button-row ext-actions">
        <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('tab:create', { input: 'https://chromewebstore.google.com/' })}>
          <Icon name="external" size={14} /> Ouvrir le Chrome Web Store
        </button>
        <button type="button" className="btn btn--s btn--ghost" disabled={busy} onClick={() => void run(() => kaze.invoke('ext:install-folder'))}>
          <Icon name="folder" size={14} /> Depuis un dossier…
        </button>
      </div>
      {message && <p className={`ext-message${message.ok ? '' : ' is-error'}`}>{message.text}</p>}

      <Block label={list.length ? `Installées (${list.length})` : 'Aucune extension installée'}>
        <ul className="ext-list">
          {list.map((ext) => (
            <li key={ext.path} className={`ext-item${ext.enabled ? '' : ' is-off'}`}>
              {ext.icon ? <img src={ext.icon} alt="" className="ext-item__icon" /> : <span className="ext-item__icon"><Icon name="puzzle" size={18} /></span>}
              <div className="ext-item__text">
                <strong>
                  {ext.name} <span>{ext.version}</span>
                </strong>
                <p>{ext.error ? `Erreur : ${ext.error}` : ext.description || (ext.storeId ? 'Chrome Web Store' : 'Dossier local')}</p>
              </div>
              <Toggle checked={ext.enabled} label={`Activer ${ext.name}`} onChange={(v) => void kaze.invoke('ext:toggle', ext.path, v)} />
              <button type="button" className="btn-icon" title="Supprimer cette extension" onClick={() => void kaze.invoke('ext:remove', ext.path)}>
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Block>
    </>
  )
}

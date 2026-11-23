/**
 * Recherche dans la page (Ctrl+F). La barre prend sa place au-dessus de la page,
 * pour que les résultats surlignés restent visibles.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import { kaze } from '../store'
import { Icon } from './Icon'

export function FindBar({ tabId, focusToken, onClose }: { tabId: number; focusToken: number; onClose: () => void }): JSX.Element {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ active: number; total: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusToken])

  useEffect(
    () =>
      kaze.on('find:result', (r) => {
        if (r.tabId === tabId) setResult({ active: r.activeMatch, total: r.matches })
      }),
    [tabId]
  )

  useEffect(() => {
    if (!text) {
      setResult(null)
      void kaze.invoke('tab:find-stop', tabId)
      return
    }
    void kaze.invoke('tab:find', tabId, text, { forward: true, findNext: false })
  }, [text, tabId])

  const close = (): void => {
    void kaze.invoke('tab:find-stop', tabId)
    onClose()
  }
  const step = (forward: boolean): void => {
    if (text) void kaze.invoke('tab:find', tabId, text, { forward, findNext: true })
  }

  return (
    <div className="findbar">
      <Icon name="search" size={15} />
      <input
        ref={input}
        value={text}
        placeholder="Rechercher dans la page"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(!e.shiftKey)
          if (e.key === 'Escape') close()
        }}
        aria-label="Rechercher dans la page"
      />
      <span className="findbar__count">{result ? (result.total ? `${result.active} / ${result.total}` : 'Aucun résultat') : ''}</span>
      <button type="button" className="btn-icon btn-icon--s" title="Précédent (Maj+Entrée)" onClick={() => step(false)}>
        <Icon name="back" size={14} />
      </button>
      <button type="button" className="btn-icon btn-icon--s" title="Suivant (Entrée)" onClick={() => step(true)}>
        <Icon name="forward" size={14} />
      </button>
      <button type="button" className="btn-icon btn-icon--s" title="Fermer (Échap)" onClick={close}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

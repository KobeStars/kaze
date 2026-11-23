/**
 * Kaze Studio : éditeur de code intégré au navigateur.
 * Explorateur de fichiers, éditeur Monaco à onglets, aperçu en direct responsive, console.
 */
import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import type { Snippet, StudioSettings } from '@shared/settings'
import type { StudioEvent, StudioLog, StudioState } from '@shared/types'
import { applyFont, applyPalette, fontStack, loadCustomFonts } from '../commun/apparence'
import { Icon } from '../ui/components/Icon'
import { Explorer } from './Explorer'
import { applyEditorTheme, formatCode, languageOf, monaco, setCustomSnippets } from './monaco'
import { Console, Preview, type Device } from './Preview'
import { BUILTIN_SNIPPETS } from './snippets'

const api = window.kazeStudio!

interface OpenFile {
  path: string
  model: monaco.editor.ITextModel
  savedVersion: number
  view: monaco.editor.ICodeEditorViewState | null
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|ico|bmp|mp4|webm|mp3|wav|woff2?|ttf|otf|pdf|zip)$/i

function errorText(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^IPC refusé \([^)]*\) : /, '')
}

/** Écran d'accueil quand aucun projet n'est ouvert. */
function Welcome({ state, onError }: { state: StudioState; onError: (m: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const run = (p: Promise<unknown>): void => void p.catch((e) => onError(errorText(e)))
  return (
    <div className="welcome">
      <div className="welcome__card">
        <div className="welcome__brand">
          <span className="welcome__kanji">風</span>
          <div>
            <h1>Kaze Studio</h1>
            <p>Code, aperçu en direct et console, dans votre navigateur.</p>
          </div>
        </div>
        <div className="welcome__actions">
          <button type="button" className="btn btn--primary" onClick={() => run(api.invoke('studio:open-folder'))}>
            <Icon name="folder" size={16} /> Ouvrir un dossier
          </button>
          <button type="button" className="btn" onClick={() => run(api.invoke('studio:open-file'))}>
            <Icon name="pen" size={16} /> Ouvrir un fichier
          </button>
        </div>
        <form
          className="welcome__new"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) run(api.invoke('studio:new-project', name.trim()))
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du nouveau projet" maxLength={80} />
          <button type="submit" className="btn" disabled={!name.trim()}>
            <Icon name="plus" size={16} /> Créer
          </button>
        </form>
        <p className="welcome__hint">Les nouveaux projets sont rangés dans Documents\Kaze Studio. Astuce : clic droit sur une page web → « Ouvrir dans Kaze Studio ».</p>
        {state.settings.recent.length > 0 && (
          <div className="welcome__recent">
            <h2>Récents</h2>
            {state.settings.recent.map((path) => (
              <button key={path} type="button" onClick={() => run(api.invoke('studio:open-recent', path))} title={path}>
                <strong>{path.split(/[\\/]/).pop()}</strong>
                <span>{path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Panneau des snippets : modèles intégrés + snippets perso. */
function SnippetsPanel({ custom, language, onInsert, onSave, onDelete }: {
  custom: Snippet[]
  language: string
  onInsert: (s: Snippet) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}): JSX.Element {
  const [name, setName] = useState('')
  const groups: [string, Snippet[]][] = [
    ['HTML', [...BUILTIN_SNIPPETS, ...custom].filter((s) => s.language === 'html')],
    ['CSS', [...BUILTIN_SNIPPETS, ...custom].filter((s) => s.language === 'css')],
    ['JavaScript', [...BUILTIN_SNIPPETS, ...custom].filter((s) => s.language === 'javascript' || s.language === 'json')]
  ]
  return (
    <div className="snippets">
      {groups.map(([label, list]) => (
        <section key={label}>
          <h3>{label}</h3>
          {list.map((s) => (
            <div key={s.id} className="snippets__item">
              <button type="button" onClick={() => onInsert(s)} title={s.body}>
                {s.name}
              </button>
              {custom.some((c) => c.id === s.id) && (
                <button type="button" className="snippets__delete" title="Supprimer" onClick={() => onDelete(s.id)}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          ))}
        </section>
      ))}
      <form
        className="snippets__new"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            onSave(name.trim())
            setName('')
          }
        }}
      >
        <span>Nouveau snippet depuis la sélection ({language || 'aucun fichier'})</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du snippet" maxLength={60} />
      </form>
      <p className="snippets__hint">Les snippets apparaissent aussi dans l’autocomplétion (préfixe 風).</p>
    </div>
  )
}

export function Studio(): JSX.Element {
  const [state, setState] = useState<StudioState | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [logs, setLogs] = useState<StudioLog[]>([])
  const [treeVersion, setTreeVersion] = useState(0)
  const [previewPath, setPreviewPath] = useState('index.html')
  const [device, setDevice] = useState<Device>('desktop')
  const [custom, setCustom] = useState<[number, number]>([1280, 800])
  const [rotated, setRotated] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [side, setSide] = useState<'fichiers' | 'snippets'>('fichiers')
  const [toast, setToast] = useState('')
  const [resizing, setResizing] = useState(false)

  const files = useRef(new Map<string, OpenFile>())
  const editorHost = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const stateRef = useRef<StudioState | null>(null)
  const activeRef = useRef<string | null>(null)
  const overlayTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const mainRef = useRef<HTMLDivElement>(null)
  stateRef.current = state
  activeRef.current = active

  const refresh = (): void => setTick((n) => n + 1)
  const showError = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 4000)
  }, [])

  const isDirty = (file: OpenFile): boolean => file.model.getAlternativeVersionId() !== file.savedVersion

  // ───────────── Ouvrir / enregistrer / fermer ─────────────

  const openFile = useCallback(
    async (path: string, line?: number, column?: number) => {
      if (/\.html?$/i.test(path)) setPreviewPath(path)
      if (IMAGE.test(path)) {
        setPreviewPath(path)
        return
      }
      let file = files.current.get(path)
      if (!file) {
        try {
          const content = await api.invoke('studio:read', path)
          const model = monaco.editor.createModel(content, languageOf(path), monaco.Uri.file(`/${path}`))
          file = { path, model, savedVersion: model.getAlternativeVersionId(), view: null }
          files.current.set(path, file)
          // Aperçu en direct : le contenu non enregistré part vers le serveur local.
          model.onDidChangeContent(() => {
            refresh()
            const s = stateRef.current?.settings
            if (!s || s.previewMode !== 'direct') return
            const timers = overlayTimers.current
            clearTimeout(timers.get(path))
            timers.set(
              path,
              setTimeout(() => {
                const f = files.current.get(path)
                if (f) void api.invoke('studio:overlay', path, isDirty(f) ? f.model.getValue() : null).catch(() => undefined)
              }, s.delay)
            )
          })
          setPaths((p) => (p.includes(path) ? p : [...p, path]))
        } catch (e) {
          showError(errorText(e))
          return
        }
      }
      // Sauvegarde de la position dans le fichier qu'on quitte.
      const current = activeRef.current ? files.current.get(activeRef.current) : undefined
      if (current && editor.current) current.view = editor.current.saveViewState()
      setActive(path)
      const ed = editor.current
      if (ed) {
        ed.setModel(file.model)
        if (file.view) ed.restoreViewState(file.view)
        if (line) {
          ed.revealLineInCenter(line)
          ed.setPosition({ lineNumber: line, column: column ?? 1 })
        }
        ed.focus()
      }
    },
    [showError]
  )

  const save = useCallback(async (path: string | null) => {
    const file = path ? files.current.get(path) : undefined
    if (!file) return
    const settings = stateRef.current?.settings
    try {
      if (settings?.formatOnSave) {
        const formatted = await formatCode(file.model.getValue(), file.model.getLanguageId()).catch(() => null)
        if (formatted !== null && formatted !== file.model.getValue()) {
          file.model.pushEditOperations([], [{ range: file.model.getFullModelRange(), text: formatted }], () => null)
        }
      }
      await api.invoke('studio:write', file.path, file.model.getValue())
      file.savedVersion = file.model.getAlternativeVersionId()
      refresh()
    } catch (e) {
      showError(errorText(e))
    }
  }, [showError])

  const close = useCallback((path: string, force = false) => {
    const file = files.current.get(path)
    if (!file) return
    if (!force && isDirty(file) && !window.confirm(`« ${path} » n’est pas enregistré. Fermer quand même ?`)) return
    if (isDirty(file)) void api.invoke('studio:overlay', path, null).catch(() => undefined)
    files.current.delete(path)
    setPaths((list) => {
      const index = list.indexOf(path)
      const next = list.filter((p) => p !== path)
      if (activeRef.current === path) {
        const neighbour = next[Math.min(index, next.length - 1)] ?? null
        setActive(neighbour)
        const f = neighbour ? files.current.get(neighbour) : undefined
        editor.current?.setModel(f?.model ?? null)
        if (f?.view) editor.current?.restoreViewState(f.view)
      }
      return next
    })
    file.model.dispose()
  }, [])

  // ───────────── Monaco ─────────────

  useEffect(() => {
    if (!state?.root || !editorHost.current || editor.current) return
    const ed = monaco.editor.create(editorHost.current, {
      model: null,
      automaticLayout: true,
      fontLigatures: true,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true },
      padding: { top: 12 },
      tabSize: 2,
      renderWhitespace: 'selection',
      linkedEditing: true,
      formatOnPaste: false,
      scrollBeyondLastLine: false
    })
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save(activeRef.current))
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => activeRef.current && close(activeRef.current))
    editor.current = ed
    const current = activeRef.current ? files.current.get(activeRef.current) : undefined
    if (current) ed.setModel(current.model)
    return () => {
      ed.dispose()
      editor.current = null
    }
  }, [state?.root, save, close])

  // Thème, polices et options de l'éditeur.
  useEffect(() => {
    if (!state) return
    const a = state.appearance
    applyPalette(state.palette, state.dark)
    applyFont('ui', a.fonts.ui, 'ui')
    applyFont('titres', a.fonts.titles, 'titres')
    applyFont('code', a.fonts.code, 'code')
    loadCustomFonts(a.customFonts, state.persoBase)
    applyEditorTheme(state.settings.editorTheme, state.palette, state.dark)
    setCustomSnippets(state.settings.snippets)
    const code = a.fonts.code
    editor.current?.updateOptions({
      fontFamily: fontStack(code.family, 'code'),
      fontSize: code.size,
      fontWeight: String(code.weight),
      lineHeight: Math.round(code.size * code.lineHeight),
      letterSpacing: code.letterSpacing * code.size,
      fontLigatures: code.ligatures,
      minimap: { enabled: state.settings.minimap },
      wordWrap: state.settings.wordWrap ? 'on' : 'off'
    })
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts())
  }, [state, state?.root])

  // ───────────── Évènements du processus principal ─────────────

  useEffect(() => {
    void api.invoke('studio:get-state').then(setState)
    return api.onEvent((event: StudioEvent) => {
      switch (event.type) {
        case 'state':
          setState((previous) => {
            if (previous?.root !== event.state.root) {
              // Nouveau projet : on repart d'un éditeur vide.
              for (const f of files.current.values()) f.model.dispose()
              files.current.clear()
              setPaths([])
              setActive(null)
              setLogs([])
              setPreviewPath('index.html')
              setTreeVersion((v) => v + 1)
            }
            return event.state
          })
          break
        case 'log':
          setLogs((l) => [...l.slice(-499), event.log])
          break
        case 'fs-changed':
          setTreeVersion((v) => v + 1)
          break
        case 'open-file':
          setTimeout(() => void openFile(event.path), 100)
          break
      }
    })
  }, [openFile])

  // Disposition « fenêtre séparée » : l'aperçu suit le fichier HTML ouvert.
  useEffect(() => {
    if (state?.root && state.settings.layout === 'fenetre') void api.invoke('studio:preview-window', previewPath).catch(() => undefined)
  }, [state?.root, state?.settings.layout, previewPath])

  // Fermer l'onglet du navigateur avec des fichiers non enregistrés : on prévient.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if ([...files.current.values()].some(isDirty)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  if (!state) return <div className="studio studio--loading" />
  if (!state.root) {
    return (
      <div className="studio">
        <Welcome state={state} onError={showError} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  const settings = state.settings
  const setSettings = (patch: Partial<StudioSettings>): void => void api.invoke('studio:settings', patch).then(setState)
  const layout = settings.layout
  const activeFile = active ? files.current.get(active) : undefined

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const box = mainRef.current?.getBoundingClientRect()
    if (!box) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setResizing(true)
    let ratio = settings.splitRatio
    const move = (e: PointerEvent): void => {
      ratio = layout === 'bas' ? (e.clientY - box.top) / box.height : (e.clientX - box.left) / box.width
      ratio = Math.min(0.8, Math.max(0.2, ratio))
      mainRef.current?.style.setProperty('--ratio', String(ratio))
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      setResizing(false)
      setSettings({ splitRatio: Math.round(ratio * 1000) / 1000 })
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }

  const insertSnippet = (snippet: Snippet): void => {
    const ed = editor.current
    if (!ed || !ed.getModel()) return showError('Ouvrez d’abord un fichier.')
    const controller = ed.getContribution('snippetController2') as { insert(template: string): void } | null
    controller?.insert(snippet.body)
    ed.focus()
  }

  const saveSnippet = (name: string): void => {
    const ed = editor.current
    const model = ed?.getModel()
    const selection = ed?.getSelection()
    const body = model && selection ? model.getValueInRange(selection) : ''
    if (!body.trim()) return showError('Sélectionnez du code dans l’éditeur pour en faire un snippet.')
    const lang = model!.getLanguageId()
    const language = lang === 'html' || lang === 'css' || lang === 'json' ? lang : 'javascript'
    setSettings({ snippets: [...settings.snippets, { id: Date.now().toString(36), name, language, body }] })
  }

  return (
    <div className={`studio studio--${layout}${resizing ? ' is-resizing' : ''}`}>
      <header className="studio__bar">
        <span className="studio__brand">
          <span className="studio__kanji">風</span> Studio
        </span>
        <span className="studio__project" title={state.root}>
          {state.name}
        </span>
        <button type="button" className="tool" title="Ouvrir un dossier" onClick={() => void api.invoke('studio:open-folder').catch((e) => showError(errorText(e)))}>
          <Icon name="folder" size={15} />
        </button>
        <button type="button" className="tool" title="Ouvrir un fichier" onClick={() => void api.invoke('studio:open-file').then((r) => r && setTimeout(() => void openFile(r.file), 150))}>
          <Icon name="pen" size={15} />
        </button>
        <button type="button" className="tool" title="Exporter le projet en .zip" onClick={() => void api.invoke('studio:export-zip').catch((e) => showError(errorText(e)))}>
          <Icon name="download" size={15} />
        </button>
        <span className="studio__spacer" />
        <div className="seg" title="Mise à jour de l’aperçu">
          <button type="button" className={settings.previewMode === 'direct' ? 'is-active' : ''} onClick={() => setSettings({ previewMode: 'direct' })}>
            En direct
          </button>
          <button type="button" className={settings.previewMode === 'sauvegarde' ? 'is-active' : ''} onClick={() => setSettings({ previewMode: 'sauvegarde' })}>
            À la sauvegarde
          </button>
        </div>
        {settings.previewMode === 'direct' && (
          <label className="studio__delay" title="Délai avant la mise à jour de l’aperçu">
            <input type="range" min={100} max={3000} step={50} value={settings.delay} onChange={(e) => setSettings({ delay: Number(e.target.value) })} />
            {settings.delay} ms
          </label>
        )}
        <div className="seg" title="Disposition">
          <button type="button" className={layout === 'droite' ? 'is-active' : ''} onClick={() => setSettings({ layout: 'droite' })} title="Aperçu à droite">
            <Icon name="split" size={15} />
          </button>
          <button type="button" className={layout === 'bas' ? 'is-active' : ''} onClick={() => setSettings({ layout: 'bas' })} title="Aperçu en bas">
            <span className="rot90">
              <Icon name="split" size={15} />
            </span>
          </button>
          <button type="button" className={layout === 'fenetre' ? 'is-active' : ''} onClick={() => setSettings({ layout: 'fenetre' })} title="Aperçu dans une fenêtre séparée">
            <Icon name="external" size={15} />
          </button>
        </div>
      </header>

      <div className="studio__body">
        <aside className="studio__side">
          <div className="seg seg--full">
            <button type="button" className={side === 'fichiers' ? 'is-active' : ''} onClick={() => setSide('fichiers')}>
              Fichiers
            </button>
            <button type="button" className={side === 'snippets' ? 'is-active' : ''} onClick={() => setSide('snippets')}>
              Snippets
            </button>
          </div>
          {side === 'fichiers' ? (
            <Explorer
              version={treeVersion}
              activePath={active}
              onOpen={(p) => void openFile(p)}
              onError={showError}
              onDeleted={(path) => {
                for (const p of [...files.current.keys()]) if (p === path || p.startsWith(`${path}/`)) close(p, true)
              }}
              onRenamed={(from, to) => {
                for (const p of [...files.current.keys()]) {
                  if (p !== from && !p.startsWith(`${from}/`)) continue
                  const file = files.current.get(p)!
                  const wasDirty = isDirty(file)
                  const content = file.model.getValue()
                  close(p, true)
                  const target = to + p.slice(from.length)
                  void openFile(target).then(() => {
                    const reopened = files.current.get(target)
                    if (reopened && wasDirty) reopened.model.setValue(content)
                  })
                }
              }}
            />
          ) : (
            <SnippetsPanel
              custom={settings.snippets}
              language={activeFile?.model.getLanguageId() ?? ''}
              onInsert={insertSnippet}
              onSave={saveSnippet}
              onDelete={(id) => setSettings({ snippets: settings.snippets.filter((s) => s.id !== id) })}
            />
          )}
        </aside>

        <div className="studio__main" ref={mainRef} style={{ ['--ratio' as string]: String(settings.splitRatio) }}>
          <section className="studio__editor">
            <div className="filetabs">
              {paths.map((p) => {
                const f = files.current.get(p)
                const dirty = f ? isDirty(f) : false
                return (
                  <div
                    key={p}
                    className={`filetab${p === active ? ' is-active' : ''}`}
                    title={p}
                    onClick={() => void openFile(p)}
                    onAuxClick={(e) => e.button === 1 && close(p)}
                  >
                    <span className="filetab__name">{p.split('/').pop()}</span>
                    <button
                      type="button"
                      className={`filetab__close${dirty ? ' is-dirty' : ''}`}
                      title={dirty ? 'Non enregistré — Ctrl+S pour enregistrer' : 'Fermer (Ctrl+W)'}
                      onClick={(e) => {
                        e.stopPropagation()
                        close(p)
                      }}
                    >
                      <span className="filetab__dot" />
                      <Icon name="close" size={11} />
                    </button>
                  </div>
                )
              })}
              {activeFile && (
                <button type="button" className="tool filetabs__format" title="Formater le fichier (Prettier)" onClick={() => void editor.current?.getAction('editor.action.formatDocument')?.run()}>
                  Formater
                </button>
              )}
            </div>
            <div className="studio__monaco" ref={editorHost} />
            {!activeFile && <div className="studio__empty">Choisissez un fichier à gauche. Ctrl+S enregistre, Ctrl+W ferme le fichier, F1 ouvre toutes les commandes de l’éditeur.</div>}
          </section>

          {layout !== 'fenetre' && <div className="splitter" onPointerDown={startResize} />}

          <section className="studio__preview">
            <div className="preview-bar">
              <input
                className="preview-bar__path"
                value={previewPath}
                onChange={(e) => setPreviewPath(e.target.value.replace(/^\/+/, ''))}
                spellCheck={false}
                title="Fichier affiché dans l’aperçu"
              />
              <button type="button" className="tool" title="Recharger l’aperçu" onClick={() => setReloadToken((n) => n + 1)}>
                <Icon name="reload" size={14} />
              </button>
              {layout !== 'fenetre' && (
                <>
                  <div className="seg">
                    {(['desktop', 'tablette', 'mobile', 'perso'] as Device[]).map((d) => (
                      <button key={d} type="button" className={device === d ? 'is-active' : ''} onClick={() => setDevice(d)}>
                        {{ desktop: 'Bureau', tablette: 'Tablette', mobile: 'Mobile', perso: 'Perso' }[d]}
                      </button>
                    ))}
                  </div>
                  {device === 'perso' && (
                    <span className="preview-bar__size">
                      <input type="number" min={200} max={3840} value={custom[0]} onChange={(e) => setCustom([Number(e.target.value) || 320, custom[1]])} />×
                      <input type="number" min={200} max={3840} value={custom[1]} onChange={(e) => setCustom([custom[0], Number(e.target.value) || 320])} />
                    </span>
                  )}
                  {device !== 'desktop' && (
                    <button type="button" className={`tool${rotated ? ' is-active' : ''}`} title="Rotation" onClick={() => setRotated(!rotated)}>
                      <Icon name="swap" size={14} />
                    </button>
                  )}
                </>
              )}
              <button type="button" className="tool" title="Ouvrir l’aperçu dans une fenêtre séparée" onClick={() => void api.invoke('studio:preview-window', previewPath)}>
                <Icon name="external" size={14} />
              </button>
            </div>
            {layout !== 'fenetre' ? (
              state.previewBase && <Preview base={state.previewBase} path={previewPath} device={device} custom={custom} rotated={rotated} reloadToken={reloadToken} />
            ) : (
              <div className="preview preview--window">L’aperçu est affiché dans une fenêtre séparée.</div>
            )}
            <Console logs={logs} onClear={() => setLogs([])} onOpen={(file, line, column) => void openFile(file, line, column)} />
          </section>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

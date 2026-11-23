/**
 * Souffle (Ctrl+K) : la palette de commandes. Tout se fait au clavier : ouvrir un site,
 * retrouver un onglet, chercher dans l'historique et les favoris, lancer une action.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Settings } from '@shared/settings'
import type { BrowserState, Suggestion } from '@shared/types'
import { displayUrl, isHomeUrl } from '@shared/url'
import { useEscape, useFreeze } from '../hooks'
import { PRESET_THEMES } from '@shared/themes'
import { STYLE_TEMPLATES, templatePatch } from '@shared/templates'
import { kaze, setAppearance, updateSettings } from '../store'
import { Favicon, Icon, KazeMark, type IconName } from './Icon'

interface Command {
  id: string
  group: 'Actions' | 'Courants' | 'Panneau latéral' | 'Onglets' | 'Favoris' | 'Historique' | 'Aller à' | 'Rechercher'
  title: string
  hint?: string
  icon?: IconName
  favicon?: string | null
  keywords?: string
  run: () => void
}

/** Normalise pour comparer sans accents ni majuscules. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Score simple : mots tous présents, gros bonus si un mot du titre commence par la saisie. */
function score(command: Command, query: string): number {
  if (!query) return 1
  const hay = fold(`${command.title} ${command.keywords ?? ''}`)
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.every((w) => hay.includes(w))) return 0
  const titleWords = fold(command.title).split(/[\s:’'«»()-]+/)
  const strong = fold(command.title).startsWith(fold(query)) || titleWords.some((t) => t.startsWith(words[0]!))
  return (strong ? 10 : 1) + (command.group === 'Actions' ? 0.5 : 0)
}

interface Props {
  state: BrowserState
  settings: Settings
  onClose: () => void
  actions: {
    openDrawer: (tab: 'historique' | 'favoris' | 'telechargements') => void
    openSettings: (section?: 'general' | 'templates' | 'extensions') => void
    openStorm: () => void
    openVpn: () => void
    editWorkspace: (create: boolean) => void
  }
}

export function Souffle({ state, settings, onClose, actions }: Props): JSX.Element {
  useFreeze(true)
  useEscape(true, onClose)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [remote, setRemote] = useState<Suggestion[]>([])
  const list = useRef<HTMLUListElement>(null)
  const tab = state.tabs.find((t) => t.id === state.activeTabId)

  useEffect(() => {
    if (!query.trim()) {
      setRemote([])
      return
    }
    const timer = setTimeout(() => void kaze.invoke('suggest:query', query).then(setRemote), 60)
    return () => clearTimeout(timer)
  }, [query])

  const commands = useMemo<Command[]>(() => {
    const run = (fn: () => unknown) => () => {
      onClose()
      fn()
    }
    const vertical = settings.appearance.tabPosition === 'gauche' || settings.appearance.tabPosition === 'droite'
    const list: Command[] = [
      { id: 'new', group: 'Actions', title: 'Nouvel onglet', hint: 'Ctrl T', icon: 'plus', run: run(() => kaze.invoke('tab:create', {})) },
      ...(tab
        ? [
            { id: 'close', group: 'Actions' as const, title: 'Fermer l’onglet', hint: 'Ctrl W', icon: 'close' as const, run: run(() => kaze.invoke('tab:close', tab.id)) },
            {
              id: 'bookmark',
              group: 'Actions' as const,
              title: tab.bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
              hint: 'Ctrl D',
              icon: 'star' as const,
              run: run(() => kaze.invoke('bookmarks:toggle-tab', tab.id))
            },
            { id: 'devtools', group: 'Actions' as const, title: 'Outils de développement', hint: 'F12', icon: 'devtools' as const, keywords: 'inspecter console', run: run(() => kaze.invoke('tab:devtools', tab.id)) }
          ]
        : []),
      { id: 'reopen', group: 'Actions', title: 'Rouvrir le dernier onglet fermé', hint: 'Ctrl Maj T', icon: 'history', run: run(() => kaze.invoke('tab:reopen-closed')) },
      { id: 'history', group: 'Actions', title: 'Historique', hint: 'Ctrl H', icon: 'history', run: run(() => actions.openDrawer('historique')) },
      { id: 'bookmarks', group: 'Actions', title: 'Favoris', hint: 'Ctrl Maj O', icon: 'bookmark', run: run(() => actions.openDrawer('favoris')) },
      { id: 'downloads', group: 'Actions', title: 'Téléchargements', hint: 'Ctrl J', icon: 'download', run: run(() => actions.openDrawer('telechargements')) },
      { id: 'settings', group: 'Actions', title: 'Paramètres', hint: 'Ctrl ,', icon: 'settings', keywords: 'options préférences réglages', run: run(() => actions.openSettings()) },
      { id: 'extensions', group: 'Actions', title: 'Extensions Chrome', icon: 'puzzle', keywords: 'extension module chrome web store ajouter', run: run(() => actions.openSettings('extensions')) },
      ...(tab && /^https:\/\/(chromewebstore\.google\.com\/detail|chrome\.google\.com\/webstore\/detail)\//.test(tab.url)
        ? [
            {
              id: 'ext-add',
              group: 'Actions' as const,
              title: 'Ajouter cette extension à Kaze',
              icon: 'puzzle' as const,
              keywords: 'extension installer chrome web store',
              run: run(() => kaze.invoke('ext:install', tab.url).then(() => actions.openSettings('extensions')))
            }
          ]
        : []),
      { id: 'templates', group: 'Actions', title: 'Templates de style', icon: 'layers', keywords: 'template style look apparence modèle thème design', run: run(() => actions.openSettings('templates')) },
      ...STYLE_TEMPLATES.map((t) => ({
        id: `template-${t.id}`,
        group: 'Actions' as const,
        title: `Template : ${t.name}`,
        icon: 'layers' as const,
        keywords: `template style look apparence ${t.description}`,
        run: run(() => setAppearance(templatePatch(settings.appearance, t)))
      })),
      {
        id: 'theme',
        group: 'Actions',
        title: state.theme === 'sombre' ? 'Passer au thème clair (Washi)' : 'Passer au thème sombre (Encre)',
        icon: 'palette',
        keywords: 'thème apparence couleur',
        run: run(() => setAppearance({ themeMode: 'manuel', themeId: state.theme === 'sombre' ? 'washi' : 'encre' }))
      },
      ...[...PRESET_THEMES, ...settings.appearance.customThemes].map((t) => ({
        id: `theme-${t.id}`,
        group: 'Actions' as const,
        title: `Thème : ${t.name}`,
        icon: 'palette' as const,
        keywords: 'thème apparence couleur',
        run: run(() => setAppearance({ themeMode: 'manuel', themeId: t.id }))
      })),
      {
        id: 'layout',
        group: 'Actions',
        title: vertical ? 'Onglets horizontaux' : 'Onglets verticaux',
        icon: 'sidebar',
        keywords: 'disposition barre latérale position',
        run: run(() => setAppearance({ tabPosition: vertical ? 'haut' : 'gauche' }))
      },
      { id: 'bienvenue', group: 'Actions', title: 'Bienvenue dans Kaze', icon: 'info', keywords: 'présentation découvrir aide premiers pas thème', run: run(() => kaze.invoke('tab:create', { input: 'kaze://bienvenue/' })) },
      { id: 'studio', group: 'Actions', title: 'Kaze Studio : éditeur de code', hint: 'Ctrl Maj E', icon: 'devtools', keywords: 'code html css javascript développeur', run: run(() => kaze.invoke('studio:open')) },
      ...(tab && /^https?:/.test(tab.url)
        ? [{ id: 'studio-page', group: 'Actions' as const, title: 'Ouvrir cette page dans Kaze Studio', icon: 'devtools' as const, keywords: 'code html css copier', run: run(() => kaze.invoke('studio:open-page', tab.id)) }]
        : []),
      { id: 'sidebar', group: 'Actions', title: settings.sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale', hint: 'Ctrl B', icon: 'sidebar', run: run(() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })) },
      state.split
        ? { id: 'split', group: 'Actions', title: 'Quitter le split view', hint: 'Ctrl Maj S', icon: 'split', run: run(() => kaze.invoke('split:close')) }
        : { id: 'split', group: 'Actions', title: 'Split view : deux pages côte à côte', hint: 'Ctrl Maj S', icon: 'split', keywords: 'diviser côte à côte', run: run(() => {
            const other = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId && t.id !== state.activeTabId).pop()
            return other ? kaze.invoke('split:open', other.id) : kaze.invoke('tab:create', { input: 'kaze://accueil/', background: true }).then((id) => kaze.invoke('split:open', id))
          }) },
      ...(tab && (/^(https?|file):/.test(tab.url) || state.responsive?.tabId === tab.id)
        ? [
            {
              id: 'responsive',
              group: 'Actions' as const,
              title: state.responsive?.tabId === tab.id ? 'Quitter le mode responsive' : 'Mode responsive : mobile, tablette et ordinateur côte à côte',
              hint: 'Ctrl Maj M',
              icon: 'devices' as const,
              keywords: 'responsive mobile tablette téléphone écran appareil taille',
              run: run(() => kaze.invoke('responsive:toggle', tab.id))
            }
          ]
        : []),
      state.storm.active
        ? { id: 'storm', group: 'Actions', title: 'Arrêter la Tempête', icon: 'storm', keywords: 'focus concentration', run: run(() => kaze.invoke('storm:stop')) }
        : { id: 'storm', group: 'Actions', title: 'Tempête : lancer une session de concentration', icon: 'storm', keywords: 'focus bloquer sites distraction', run: run(actions.openStorm) },
      settings.vpn.enabled
        ? { id: 'vpn', group: 'Actions', title: 'Désactiver Brume (VPN)', icon: 'mist', keywords: 'vpn tor ip proxy anonyme', run: run(() => kaze.invoke('vpn:set', false)) }
        : { id: 'vpn', group: 'Actions', title: 'Brume : activer le VPN (réseau Tor)', icon: 'mist', keywords: 'vpn tor ip proxy anonyme cacher', run: run(() => kaze.invoke('vpn:set', true)) },
      { id: 'vpn-settings', group: 'Actions', title: 'Brume : pays de sortie et état du VPN', icon: 'mist', keywords: 'vpn tor pays ip', run: run(actions.openVpn) },
      {
        id: 'breeze',
        group: 'Actions',
        title: 'Brise : mettre en veille les onglets inactifs',
        icon: 'wind',
        keywords: 'mémoire ram économie veille',
        run: run(() => {
          const visible = new Set([state.activeTabId, state.split?.primaryId, state.split?.secondaryId])
          for (const t of state.tabs) if (!t.asleep && !visible.has(t.id) && !t.audible) void kaze.invoke('tab:sleep', t.id)
        })
      },
      { id: 'shield', group: 'Actions', title: state.shield.enabled ? 'Désactiver le Bouclier de vent' : 'Activer le Bouclier de vent', icon: 'shield', keywords: 'pub publicité bloqueur traqueurs', run: run(() => updateSettings({ shield: { ...settings.shield, enabled: !state.shield.enabled } })) },
      { id: 'fullscreen', group: 'Actions', title: 'Plein écran', hint: 'F11', icon: 'fullscreen', run: run(() => kaze.invoke('window:toggle-fullscreen')) },
      { id: 'ws-new', group: 'Courants', title: 'Nouveau Courant', icon: 'layers', keywords: 'espace de travail workspace', run: run(() => actions.editWorkspace(true)) },
      ...state.workspaces
        .filter((w) => w.id !== state.activeWorkspaceId)
        .map((w) => ({ id: `ws-${w.id}`, group: 'Courants' as const, title: `${w.icon}  ${w.name}`, keywords: 'courant espace workspace', icon: 'layers' as const, run: run(() => kaze.invoke('workspace:activate', w.id)) })),
      ...state.panel.apps.map((a) => ({ id: `panel-${a.id}`, group: 'Panneau latéral' as const, title: a.name, favicon: a.favicon, keywords: 'panneau web app', run: run(() => kaze.invoke('panel:open', a.id)) })),
      ...state.tabs
        .filter((t) => t.workspaceId === state.activeWorkspaceId)
        .map((t) => ({
          id: `tab-${t.id}`,
          group: 'Onglets' as const,
          title: isHomeUrl(t.url) ? 'Nouvel onglet' : t.title || displayUrl(t.url),
          keywords: t.url,
          favicon: t.favicon,
          run: run(() => kaze.invoke('tab:activate', t.id))
        }))
    ]
    return list
  }, [state, settings, tab, actions, onClose])

  const results = useMemo(() => {
    const local = commands
      .map((c) => ({ c, s: score(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
    if (!query.trim()) return local.filter((c) => c.group !== 'Panneau latéral').slice(0, 14)
    const fromRemote: Command[] = remote
      .filter((s) => s.kind !== 'onglet')
      .map((s, i) => ({
        id: `r-${i}`,
        group: s.kind === 'favori' ? 'Favoris' : s.kind === 'historique' ? 'Historique' : s.kind === 'url' ? 'Aller à' : 'Rechercher',
        title: s.kind === 'recherche' ? `Rechercher « ${s.title} »` : s.title,
        keywords: s.url,
        favicon: s.favicon,
        icon: s.kind === 'recherche' ? 'search' : s.kind === 'url' ? 'globe' : undefined,
        hint: s.kind === 'recherche' || s.kind === 'url' ? undefined : displayUrl(s.url),
        run: () => {
          onClose()
          void kaze.invoke('tab:create', { input: s.url })
        }
      }))
    const direct = fromRemote.filter((c) => c.group === 'Aller à' || c.group === 'Rechercher')
    const others = fromRemote.filter((c) => c.group !== 'Aller à' && c.group !== 'Rechercher')
    // Si une commande commence par la saisie (« split », « thème »…), elle passe avant la
    // recherche web ; sinon (« github.com », « météo »), l'action directe reste en tête.
    const strongLocal = local.length > 0 && score(local[0]!, query) >= 10
    return strongLocal
      ? [...local.slice(0, 8), ...direct, ...others.slice(0, 8)]
      : [...direct.slice(0, 1), ...local.slice(0, 8), ...others.slice(0, 8), ...direct.slice(1)]
  }, [commands, remote, query, onClose])

  useEffect(() => setSelected(0), [query])
  useEffect(() => {
    list.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  let lastGroup = ''
  return (
    <div className="modal-backdrop modal-backdrop--top" onMouseDown={onClose}>
      <div className="souffle glass" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Souffle">
        <div className="souffle__input">
          <KazeMark size={20} />
          <input
            autoFocus
            value={query}
            placeholder="Que voulez-vous faire ? Site, onglet, action…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                results[selected]?.run()
              }
            }}
            aria-label="Commande"
          />
          <kbd>Échap</kbd>
        </div>
        <ul className="souffle__list" ref={list} role="listbox">
          {results.length === 0 && <li className="souffle__empty">Aucun résultat. Entrée pour rechercher sur le web.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <li key={c.id} role="presentation">
                {header && <div className="souffle__group">{header}</div>}
                <div
                  role="option"
                  aria-selected={i === selected}
                  className={`souffle__item${i === selected ? ' is-selected' : ''}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => c.run()}
                >
                  <span className="souffle__icon">{c.icon ? <Icon name={c.icon} size={16} /> : <Favicon src={c.favicon ?? null} title={c.title} />}</span>
                  <span className="souffle__title">{c.title}</span>
                  {c.hint && <span className="souffle__hint">{c.hint}</span>}
                </div>
              </li>
            )
          })}
        </ul>
        <footer className="souffle__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
          <span><kbd>Entrée</kbd> valider</span>
          <span className="souffle__brand">Souffle 息</span>
        </footer>
      </div>
    </div>
  )
}

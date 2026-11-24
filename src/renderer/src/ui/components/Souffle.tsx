/**
 * Souffle (Ctrl+K) : la palette de commandes. Tout se fait au clavier : ouvrir un site,
 * retrouver un onglet, chercher dans l'historique et les favoris, lancer une action.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Settings } from '@shared/settings'
import type { BrowserState, Suggestion } from '@shared/types'
import { displayUrl, isHomeUrl } from '@shared/url'
import { useEscape, useFreeze } from '../hooks'
import { PRESET_THEMES, themeName } from '@shared/themes'
import { STYLE_TEMPLATES, templatePatch } from '@shared/templates'
import { kaze, setAppearance, updateSettings } from '../store'
import { Favicon, Icon, KazeMark, type IconName } from './Icon'
import { t } from '@shared/i18n'

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

/** Titres des groupes, affichés au-dessus des résultats. */
const GROUP_LABELS: Record<Command['group'], string> = {
  Actions: t('Actions'),
  Courants: t('Courants'),
  'Panneau latéral': t('Panneau latéral'),
  Onglets: t('Onglets'),
  Favoris: t('Favoris'),
  Historique: t('Historique'),
  'Aller à': t('Aller à'),
  Rechercher: t('Rechercher')
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
      { id: 'new', group: 'Actions', title: t('Nouvel onglet'), hint: 'Ctrl T', icon: 'plus', run: run(() => kaze.invoke('tab:create', {})) },
      ...(tab
        ? [
            { id: 'close', group: 'Actions' as const, title: t('Fermer l’onglet'), hint: 'Ctrl W', icon: 'close' as const, run: run(() => kaze.invoke('tab:close', tab.id)) },
            {
              id: 'bookmark',
              group: 'Actions' as const,
              title: tab.bookmarked ? t('Retirer des favoris') : t('Ajouter aux favoris'),
              hint: 'Ctrl D',
              icon: 'star' as const,
              run: run(() => kaze.invoke('bookmarks:toggle-tab', tab.id))
            },
            { id: 'devtools', group: 'Actions' as const, title: t('Outils de développement'), hint: 'F12', icon: 'devtools' as const, keywords: 'inspecter console', run: run(() => kaze.invoke('tab:devtools', tab.id)) }
          ]
        : []),
      { id: 'reopen', group: 'Actions', title: t('Rouvrir le dernier onglet fermé'), hint: t('Ctrl Maj T'), icon: 'history', run: run(() => kaze.invoke('tab:reopen-closed')) },
      { id: 'history', group: 'Actions', title: t('Historique'), hint: 'Ctrl H', icon: 'history', run: run(() => actions.openDrawer('historique')) },
      { id: 'bookmarks', group: 'Actions', title: t('Favoris'), hint: t('Ctrl Maj O'), icon: 'bookmark', run: run(() => actions.openDrawer('favoris')) },
      { id: 'downloads', group: 'Actions', title: t('Téléchargements'), hint: 'Ctrl J', icon: 'download', run: run(() => actions.openDrawer('telechargements')) },
      { id: 'settings', group: 'Actions', title: t('Paramètres'), hint: 'Ctrl ,', icon: 'settings', keywords: t('options préférences réglages'), run: run(() => actions.openSettings()) },
      { id: 'extensions', group: 'Actions', title: t('Extensions Chrome'), icon: 'puzzle', keywords: 'extension module chrome web store ajouter', run: run(() => actions.openSettings('extensions')) },
      ...(tab && /^https:\/\/(chromewebstore\.google\.com\/detail|chrome\.google\.com\/webstore\/detail)\//.test(tab.url)
        ? [
            {
              id: 'ext-add',
              group: 'Actions' as const,
              title: t('Ajouter cette extension à Kaze'),
              icon: 'puzzle' as const,
              keywords: 'extension installer chrome web store',
              run: run(() => kaze.invoke('ext:install', tab.url).then(() => actions.openSettings('extensions')))
            }
          ]
        : []),
      { id: 'templates', group: 'Actions', title: t('Templates de style'), icon: 'layers', keywords: t('template style look apparence modèle thème design'), run: run(() => actions.openSettings('templates')) },
      ...STYLE_TEMPLATES.map((template) => ({
        id: `template-${template.id}`,
        group: 'Actions' as const,
        title: t('Template : {name}', { name: template.name }),
        icon: 'layers' as const,
        keywords: `${t('template style look apparence')} ${template.description}`,
        run: run(() => setAppearance(templatePatch(settings.appearance, template)))
      })),
      {
        id: 'theme',
        group: 'Actions',
        title: state.theme === 'sombre' ? t('Passer au thème clair (Washi)') : t('Passer au thème sombre (Encre)'),
        icon: 'palette',
        keywords: t('thème apparence couleur'),
        run: run(() => setAppearance({ themeMode: 'manuel', themeId: state.theme === 'sombre' ? 'washi' : 'encre' }))
      },
      ...[...PRESET_THEMES, ...settings.appearance.customThemes].map((theme) => ({
        id: `theme-${theme.id}`,
        group: 'Actions' as const,
        title: t('Thème : {name}', { name: themeName(theme) }),
        icon: 'palette' as const,
        keywords: t('thème apparence couleur'),
        run: run(() => setAppearance({ themeMode: 'manuel', themeId: theme.id }))
      })),
      {
        id: 'layout',
        group: 'Actions',
        title: vertical ? t('Onglets horizontaux') : t('Onglets verticaux'),
        icon: 'sidebar',
        keywords: t('disposition barre latérale position'),
        run: run(() => setAppearance({ tabPosition: vertical ? 'haut' : 'gauche' }))
      },
      { id: 'bienvenue', group: 'Actions', title: t('Bienvenue dans Kaze'), icon: 'info', keywords: t('présentation découvrir aide premiers pas thème'), run: run(() => kaze.invoke('tab:create', { input: 'kaze://bienvenue/' })) },
      { id: 'studio', group: 'Actions', title: t('Kaze Studio : éditeur de code'), hint: t('Ctrl Maj E'), icon: 'devtools', keywords: t('code html css javascript développeur'), run: run(() => kaze.invoke('studio:open')) },
      ...(tab && /^https?:/.test(tab.url)
        ? [{ id: 'studio-page', group: 'Actions' as const, title: t('Ouvrir cette page dans Kaze Studio'), icon: 'devtools' as const, keywords: 'code html css copier', run: run(() => kaze.invoke('studio:open-page', tab.id)) }]
        : []),
      { id: 'sidebar', group: 'Actions', title: settings.sidebarCollapsed ? t('Déplier la barre latérale') : t('Replier la barre latérale'), hint: 'Ctrl B', icon: 'sidebar', run: run(() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })) },
      state.split
        ? { id: 'split', group: 'Actions', title: t('Quitter le split view'), hint: t('Ctrl Maj S'), icon: 'split', run: run(() => kaze.invoke('split:close')) }
        : { id: 'split', group: 'Actions', title: t('Split view : deux pages côte à côte'), hint: t('Ctrl Maj S'), icon: 'split', keywords: t('diviser côte à côte'), run: run(() => {
            const other = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId && t.id !== state.activeTabId).pop()
            return other ? kaze.invoke('split:open', other.id) : kaze.invoke('tab:create', { input: 'kaze://accueil/', background: true }).then((id) => kaze.invoke('split:open', id))
          }) },
      ...(tab && (/^(https?|file):/.test(tab.url) || state.responsive?.tabId === tab.id)
        ? [
            {
              id: 'responsive',
              group: 'Actions' as const,
              title: state.responsive?.tabId === tab.id ? t('Quitter le mode responsive') : t('Mode responsive : mobile, tablette et ordinateur côte à côte'),
              hint: t('Ctrl Maj M'),
              icon: 'devices' as const,
              keywords: t('responsive mobile tablette téléphone écran appareil taille'),
              run: run(() => kaze.invoke('responsive:toggle', tab.id))
            }
          ]
        : []),
      state.storm.active
        ? { id: 'storm', group: 'Actions', title: t('Arrêter la Tempête'), icon: 'storm', keywords: 'focus concentration', run: run(() => kaze.invoke('storm:stop')) }
        : { id: 'storm', group: 'Actions', title: t('Tempête : lancer une session de concentration'), icon: 'storm', keywords: 'focus bloquer sites distraction', run: run(actions.openStorm) },
      settings.vpn.enabled
        ? { id: 'vpn', group: 'Actions', title: t('Désactiver Brume (VPN)'), icon: 'mist', keywords: 'vpn tor ip proxy anonyme', run: run(() => kaze.invoke('vpn:set', false)) }
        : { id: 'vpn', group: 'Actions', title: t('Brume : activer le VPN (réseau Tor)'), icon: 'mist', keywords: 'vpn tor ip proxy anonyme cacher', run: run(() => kaze.invoke('vpn:set', true)) },
      { id: 'vpn-settings', group: 'Actions', title: t('Brume : pays de sortie et état du VPN'), icon: 'mist', keywords: 'vpn tor pays ip', run: run(actions.openVpn) },
      {
        id: 'breeze',
        group: 'Actions',
        title: t('Brise : mettre en veille les onglets inactifs'),
        icon: 'wind',
        keywords: t('mémoire ram économie veille'),
        run: run(() => {
          const visible = new Set([state.activeTabId, state.split?.primaryId, state.split?.secondaryId])
          for (const t of state.tabs) if (!t.asleep && !visible.has(t.id) && !t.audible) void kaze.invoke('tab:sleep', t.id)
        })
      },
      { id: 'shield', group: 'Actions', title: state.shield.enabled ? t('Désactiver le Bouclier de vent') : t('Activer le Bouclier de vent'), icon: 'shield', keywords: t('pub publicité bloqueur traqueurs'), run: run(() => updateSettings({ shield: { ...settings.shield, enabled: !state.shield.enabled } })) },
      { id: 'fullscreen', group: 'Actions', title: t('Plein écran'), hint: 'F11', icon: 'fullscreen', run: run(() => kaze.invoke('window:toggle-fullscreen')) },
      { id: 'ws-new', group: 'Courants', title: t('Nouveau Courant'), icon: 'layers', keywords: t('espace de travail workspace'), run: run(() => actions.editWorkspace(true)) },
      ...state.workspaces
        .filter((w) => w.id !== state.activeWorkspaceId)
        .map((w) => ({ id: `ws-${w.id}`, group: 'Courants' as const, title: `${w.icon}  ${w.name}`, keywords: 'courant espace workspace', icon: 'layers' as const, run: run(() => kaze.invoke('workspace:activate', w.id)) })),
      ...state.panel.apps.map((a) => ({ id: `panel-${a.id}`, group: 'Panneau latéral' as const, title: a.name, favicon: a.favicon, keywords: t('panneau web app'), run: run(() => kaze.invoke('panel:open', a.id)) })),
      ...state.tabs
        .filter((tb) => tb.workspaceId === state.activeWorkspaceId)
        .map((tb) => ({
          id: `tab-${tb.id}`,
          group: 'Onglets' as const,
          title: isHomeUrl(tb.url) ? t('Nouvel onglet') : tb.title || displayUrl(tb.url),
          keywords: tb.url,
          favicon: tb.favicon,
          run: run(() => kaze.invoke('tab:activate', tb.id))
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
        title: s.kind === 'recherche' ? t('Rechercher « {texte} »', { texte: s.title }) : s.title,
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
      <div className="souffle glass" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('Souffle')}>
        <div className="souffle__input">
          <KazeMark size={20} />
          <input
            autoFocus
            value={query}
            placeholder={t('Que voulez-vous faire ? Site, onglet, action…')}
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
            aria-label={t('Commande')}
          />
          <kbd>{t('Échap')}</kbd>
        </div>
        <ul className="souffle__list" ref={list} role="listbox">
          {results.length === 0 && <li className="souffle__empty">{t('Aucun résultat. Entrée pour rechercher sur le web.')}</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <li key={c.id} role="presentation">
                {header && <div className="souffle__group">{GROUP_LABELS[header]}</div>}
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
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('naviguer')}</span>
          <span><kbd>{t('Entrée')}</kbd> {t('valider')}</span>
          <span className="souffle__brand">{t('Souffle 息')}</span>
        </footer>
      </div>
    </div>
  )
}

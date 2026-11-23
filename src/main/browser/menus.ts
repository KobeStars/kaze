/**
 * Menus contextuels natifs : clic droit dans une page et clic droit sur un onglet.
 * Les menus natifs de Windows passent au-dessus des pages, ce qui évite de devoir
 * figer l'affichage comme pour les fenêtres flottantes de l'interface.
 */
import { Menu, clipboard, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { isAllowedTabUrl, isHomeUrl, searchUrl, SEARCH_ENGINES } from '@shared/url'
import type { BrowserController } from './controller'
import type { Tab } from './tab'

/** Raccourcit un texte pour l'afficher dans un menu. */
function ellipsis(text: string, max = 28): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function pageContextMenu(
  browser: BrowserController,
  tab: Tab,
  params: ContextMenuParams,
  contents: WebContents | null = tab.contents
): Menu {
  const items: MenuItemConstructorOptions[] = []
  const separator = (): void => {
    if (items.length > 0 && items[items.length - 1]!.type !== 'separator') items.push({ type: 'separator' })
  }
  const engine = browser.settingsSnapshot().searchEngine

  // Correcteur orthographique
  if (params.misspelledWord && contents) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) })
    }
    if (params.dictionarySuggestions.length === 0) items.push({ label: 'Aucune suggestion', enabled: false })
    items.push({
      label: 'Ajouter au dictionnaire',
      click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    })
    separator()
  }

  // Liens
  if (params.linkURL && isAllowedTabUrl(params.linkURL) && !params.linkURL.startsWith('kaze:')) {
    items.push(
      { label: 'Ouvrir le lien dans un nouvel onglet', click: () => browser.createTab({ url: params.linkURL, afterId: tab.id, activate: false }) },
      {
        label: 'Ouvrir le lien en split view',
        click: () => browser.openSplit(browser.createTab({ url: params.linkURL, afterId: tab.id, activate: false }))
      },
      { label: "Copier l'adresse du lien", click: () => clipboard.writeText(params.linkURL) }
    )
    separator()
  }

  // Images
  if (params.mediaType === 'image' && params.srcURL && contents) {
    items.push(
      { label: "Ouvrir l'image dans un nouvel onglet", click: () => browser.createTab({ url: params.srcURL, afterId: tab.id, activate: false }) },
      { label: "Enregistrer l'image", click: () => contents.downloadURL(params.srcURL) },
      { label: "Copier l'image", click: () => contents.copyImageAt(params.x, params.y) },
      { label: "Copier l'adresse de l'image", click: () => clipboard.writeText(params.srcURL) }
    )
    separator()
  }

  // Champs de texte
  if (params.isEditable && contents) {
    const flags = params.editFlags
    items.push(
      { label: 'Annuler', role: 'undo', enabled: flags.canUndo },
      { label: 'Rétablir', role: 'redo', enabled: flags.canRedo },
      { type: 'separator' },
      { label: 'Couper', role: 'cut', enabled: flags.canCut },
      { label: 'Copier', role: 'copy', enabled: flags.canCopy },
      { label: 'Coller', role: 'paste', enabled: flags.canPaste },
      { label: 'Coller sans mise en forme', role: 'pasteAndMatchStyle', enabled: flags.canPaste },
      { label: 'Tout sélectionner', role: 'selectAll', enabled: flags.canSelectAll }
    )
    separator()
  } else if (params.selectionText.trim()) {
    const selection = params.selectionText.trim()
    items.push(
      { label: 'Copier', role: 'copy' },
      {
        label: `Rechercher « ${ellipsis(selection)} » avec ${SEARCH_ENGINES[engine].name}`,
        click: () => browser.createTab({ url: searchUrl(selection, engine), afterId: tab.id })
      }
    )
    separator()
  }

  // Navigation (page principale uniquement)
  if (!params.linkURL && !params.isEditable && params.mediaType === 'none' && !params.selectionText.trim() && contents === tab.contents) {
    items.push(
      { label: 'Précédent', enabled: tab.state.canGoBack, click: () => tab.go('back') },
      { label: 'Suivant', enabled: tab.state.canGoForward, click: () => tab.go('forward') },
      { label: 'Recharger', click: () => tab.go('reload') },
      { type: 'separator' },
      {
        label: tab.state.bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
        enabled: !isHomeUrl(tab.state.url),
        click: () => browser.toggleBookmark(tab.id)
      },
      { label: 'Imprimer…', click: () => contents?.print() },
      {
        label: 'Ouvrir dans Kaze Studio',
        enabled: /^https?:/.test(tab.state.url),
        click: () => void browser.openPageInStudio(tab.id)
      }
    )
    separator()
  }

  if (contents) {
    items.push({ label: 'Inspecter', click: () => contents.inspectElement(params.x, params.y) })
  }
  return Menu.buildFromTemplate(items)
}

export function tabContextMenu(browser: BrowserController, tab: Tab): Menu {
  const state = browser.getState()
  const otherWorkspaces = state.workspaces.filter((w) => w.id !== tab.state.workspaceId)
  const active = state.activeTabId
  const items: MenuItemConstructorOptions[] = [
    { label: 'Nouvel onglet à droite', click: () => browser.createTab({ afterId: tab.id }) },
    { label: 'Recharger', click: () => tab.go('reload') },
    { label: 'Dupliquer', click: () => browser.duplicate(tab.id) },
    {
      label: tab.state.muted ? 'Rétablir le son' : 'Couper le son',
      enabled: !tab.state.asleep,
      click: () => tab.toggleMute()
    },
    { type: 'separator' },
    {
      label: 'Afficher en split view',
      enabled: active !== null && active !== tab.id && !state.split,
      click: () => browser.openSplit(tab.id)
    },
    {
      label: 'Déplacer vers le Courant',
      enabled: otherWorkspaces.length > 0,
      submenu: otherWorkspaces.map((w) => ({
        label: `${w.icon}  ${w.name}`,
        click: () => browser.moveTabToWorkspace(tab.id, w.id)
      }))
    },
    {
      label: 'Mettre en veille (Brise)',
      enabled: !tab.state.asleep && tab.id !== active,
      click: () => browser.sleepTab(tab.id)
    },
    {
      label: tab.state.bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
      enabled: !isHomeUrl(tab.state.url),
      click: () => browser.toggleBookmark(tab.id)
    },
    { type: 'separator' },
    { label: 'Fermer les autres onglets', click: () => browser.closeOthers(tab.id) },
    { label: "Fermer l'onglet", click: () => browser.closeTab(tab.id) }
  ]
  return Menu.buildFromTemplate(items)
}

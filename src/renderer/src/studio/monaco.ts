/**
 * Configuration de Monaco Editor (le moteur de VS Code) pour Kaze Studio :
 * workers des langages, thèmes aux couleurs de Kaze, Emmet, formatage Prettier, snippets.
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import { emmetCSS, emmetHTML } from 'emmet-monaco-es'
import type { Snippet, StudioSettings } from '@shared/settings'
import { PRESET_THEMES, type ThemeColors } from '@shared/themes'
import { BUILTIN_SNIPPETS } from './snippets'

// Les services de langage tournent dans des workers (hors du fil de l'interface).
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

// Emmet : « ul>li*3 » + Tab dans le HTML, « m10 » + Tab dans le CSS.
emmetHTML(monaco, ['html'])
emmetCSS(monaco, ['css', 'scss', 'less'])

/** Langage Monaco d'après l'extension d'un fichier. */
export function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    svg: 'xml',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    py: 'python',
    php: 'php',
    sh: 'shell'
  }
  return map[ext] ?? 'plaintext'
}

const hex = (color: string): string => color.replace('#', '')

/** Thème Monaco construit à partir d'une palette de Kaze. */
function defineKazeTheme(name: string, colors: ThemeColors, dark: boolean): void {
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: hex(colors.muted), fontStyle: 'italic' },
      { token: 'keyword', foreground: hex(colors.accent) },
      { token: 'tag', foreground: hex(colors.accent) },
      { token: 'metatag', foreground: hex(colors.accent) }
    ],
    colors: {
      'editor.background': colors.bg,
      'editor.foreground': colors.text,
      'editorLineNumber.foreground': colors.muted + '99',
      'editorLineNumber.activeForeground': colors.text,
      'editor.lineHighlightBackground': colors.text + '0D',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': colors.accent + '40',
      'editor.inactiveSelectionBackground': colors.accent + '22',
      'editorCursor.foreground': colors.accent,
      'editorIndentGuide.background1': colors.border,
      'editorWidget.background': colors.surface,
      'editorWidget.border': colors.border,
      'editorSuggestWidget.background': colors.surface,
      'editorSuggestWidget.selectedBackground': colors.accent + '30',
      'minimap.background': colors.bg,
      'scrollbarSlider.background': colors.text + '1A',
      'scrollbarSlider.hoverBackground': colors.text + '2E',
      focusBorder: colors.accent
    }
  })
}

/** Applique le thème choisi (« Comme Kaze » suit la palette du navigateur). */
export function applyEditorTheme(choice: StudioSettings['editorTheme'], palette: ThemeColors, dark: boolean): void {
  if (choice === 'vs-dark' || choice === 'vs' || choice === 'hc-black') {
    monaco.editor.setTheme(choice)
    return
  }
  if (choice === 'auto') {
    defineKazeTheme('kaze-auto', palette, dark)
    monaco.editor.setTheme('kaze-auto')
    return
  }
  const preset = PRESET_THEMES.find((t) => t.id === choice)!
  defineKazeTheme(`kaze-${choice}`, preset.colors, preset.dark)
  monaco.editor.setTheme(`kaze-${choice}`)
}

// ───────────── Prettier (chargé à la demande) ─────────────

const PARSERS: Record<string, string> = {
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  javascript: 'babel',
  typescript: 'babel-ts',
  json: 'json',
  markdown: 'markdown'
}

export async function formatCode(code: string, language: string): Promise<string> {
  const parser = PARSERS[language]
  if (!parser) return code
  const [prettier, html, postcss, babel, estree, markdown] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/html'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/markdown')
  ])
  return prettier.format(code, {
    parser,
    plugins: [html, postcss, babel, estree, markdown],
    singleQuote: true,
    semi: false,
    printWidth: 100
  })
}

for (const language of Object.keys(PARSERS)) {
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    async provideDocumentFormattingEdits(model) {
      try {
        const formatted = await formatCode(model.getValue(), language)
        return [{ range: model.getFullModelRange(), text: formatted }]
      } catch (error) {
        console.warn('Formatage impossible', error)
        return []
      }
    }
  })
}

// ───────────── Snippets dans l'autocomplétion ─────────────

let customSnippets: Snippet[] = []

export function setCustomSnippets(snippets: Snippet[]): void {
  customSnippets = snippets
}

for (const language of ['html', 'css', 'javascript', 'json'] as const) {
  monaco.languages.registerCompletionItemProvider(language, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const all = [...BUILTIN_SNIPPETS, ...customSnippets].filter((s) => s.language === language)
      return {
        suggestions: all.map((s) => ({
          label: `風 ${s.name}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: s.body,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        }))
      }
    }
  })
}

export { monaco }

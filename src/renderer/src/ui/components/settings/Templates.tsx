/**
 * Paramètres → Templates : des looks complets pour Kaze, appliqués en un clic.
 * Les templates sont définis en code dans src/shared/templates.ts.
 */
import { useState, type CSSProperties, type JSX } from 'react'
import type { Appearance } from '@shared/settings'
import { STYLE_TEMPLATES, activeTemplate, appearanceBackup, templatePatch, type StyleTemplate } from '@shared/templates'
import { setAppearance } from '../../store'
import { Icon } from '../Icon'
import { SectionTitle } from './controls'

/** Style d'avant le premier template appliqué (jusqu'au redémarrage de Kaze). */
let backup: Partial<Appearance> | null = null

/** Mini fenêtre de Kaze aux couleurs et aux formes du template. */
function Preview({ template }: { template: StyleTemplate }): JSX.Element {
  const c = template.colors
  const r = Math.min(template.look.radius, 14)
  const box = (style: CSSProperties): CSSProperties => ({ borderRadius: r * 0.5, ...style })
  return (
    <div className="template-card__preview" style={{ background: c.bg, borderColor: c.border, borderRadius: Math.max(4, r) }} aria-hidden="true">
      <div className="template-card__side" style={{ background: c.chrome }}>
        <span style={box({ background: c.tab, boxShadow: `inset 3px 0 0 ${c.accent}` })} />
        <span style={box({ background: c.surface })} />
        <span style={box({ background: c.surface })} />
      </div>
      <div className="template-card__main">
        <span className="template-card__address" style={box({ background: c.address, border: `1px solid ${c.border}` })} />
        <div className="template-card__page" style={box({ background: c.surface, border: `1px solid ${c.border}` })}>
          <span className="template-card__kanji" style={{ color: c.text }}>
            {template.kanji}
          </span>
          <span className="template-card__line" style={{ background: c.text }} />
          <span className="template-card__line template-card__line--short" style={{ background: c.muted }} />
          <span className="template-card__button" style={box({ background: c.accent })} />
        </div>
      </div>
    </div>
  )
}

export function TemplatesSection({ appearance }: { appearance: Appearance }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [, refresh] = useState(0)
  const current = activeTemplate(appearance)

  const apply = (template: StyleTemplate): void => {
    if (!backup && !current) backup = appearanceBackup(appearance)
    setAppearance(templatePatch(appearance, template))
  }
  const restore = (): void => {
    if (!backup) return
    setAppearance(backup)
    backup = null
    refresh((n) => n + 1)
  }

  return (
    <>
      <SectionTitle>Templates</SectionTitle>
      <p className="settings__intro">
        Des styles complets pour toute l’interface : couleurs, formes, flou, polices et un peu de CSS. La position des onglets,
        la page d’accueil et vos règles par site ne changent pas. Le code CSS du template va dans Avancé → CSS personnalisé,
        où vous pouvez le retoucher.
      </p>
      {backup && (
        <div className="template-restore">
          <span>Un template est appliqué.</span>
          <button type="button" className="btn btn--s btn--ghost" onClick={restore}>
            <Icon name="back" size={14} /> Revenir à mon style d’avant
          </button>
        </div>
      )}
      <div className="template-grid">
        {STYLE_TEMPLATES.map((template) => {
          const active = current?.id === template.id
          return (
            <article key={template.id} className={`template-card${active ? ' is-active' : ''}`}>
              <Preview template={template} />
              <div className="template-card__text">
                <h3>
                  <span className="template-card__seal" aria-hidden="true">
                    {template.kanji}
                  </span>
                  {template.name}
                </h3>
                <p>{template.description}</p>
              </div>
              <div className="template-card__actions">
                <button type="button" className={`btn btn--s ${active ? '' : 'btn--primary'}`} disabled={active} onClick={() => apply(template)}>
                  {active ? (
                    <>
                      <Icon name="check" size={14} /> Appliqué
                    </>
                  ) : (
                    'Appliquer'
                  )}
                </button>
                <button type="button" className="btn btn--s btn--ghost" aria-expanded={code === template.id} onClick={() => setCode(code === template.id ? null : template.id)}>
                  <Icon name="devtools" size={14} /> Code
                </button>
              </div>
              {code === template.id && <pre className="template-card__code">{template.css}</pre>}
            </article>
          )
        })}
      </div>
    </>
  )
}

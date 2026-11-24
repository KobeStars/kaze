/**
 * Test de fumée automatique (développement uniquement) : lancé avec la variable
 * KAZE_AUTOTEST=<dossier>, Kaze s'ouvre dans une fenêtre invisible, ouvre Kaze Studio,
 * crée un projet, vérifie le serveur d'aperçu, puis enregistre des captures et un rapport
 * dans <dossier> avant de quitter. N'existe pas dans la version installée.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, components, net, shell, WebContentsView } from 'electron'
import { STYLE_TEMPLATES, templatePatch } from '@shared/templates'
import { WALLPAPERS } from '@shared/wallpapers'
import type { BrowserController, Services } from './browser/controller'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function runAutotest(dir: string, win: BrowserWindow, browser: BrowserController, services: Services): Promise<void> {
  const report: string[] = []
  const ok = (label: string, value: boolean, detail = ''): void => {
    report.push(`${value ? 'OK ' : 'ÉCHEC'}  ${label}${detail ? ` — ${detail}` : ''}`)
    // Rapport écrit au fur et à mesure : lisible même si le test est interrompu.
    writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
  }
  const shot = async (name: string): Promise<void> => {
    const contents = browser.currentTab()?.contents
    for (const [suffix, target] of [['page', contents], ['interface', win.webContents]] as const) {
      if (!target) continue
      try {
        // Une page retirée de la fenêtre (gelée sous une fenêtre flottante) ne répond jamais.
        const image = await Promise.race([target.capturePage(), wait(3000).then(() => Promise.reject(new Error('délai dépassé')))])
        writeFileSync(join(dir, `${name}-${suffix}.png`), image.toPNG())
      } catch (error) {
        report.push(`(capture ${name}-${suffix} impossible : ${String(error)})`)
      }
    }
  }
  try {
    await wait(4000)
    await shot('1-accueil')

    if (process.env['KAZE_AUTOTEST_BIENVENUE']) {
      // Premier lancement (profil neuf) : la page de bienvenue doit être l'onglet actif.
      const tab = browser.currentTab()
      ok('Bienvenue ouverte au premier lancement', !!tab && tab.state.url.startsWith('kaze://bienvenue'), tab?.state.url ?? 'aucun onglet')
      ok('Bienvenue marquée comme vue', services.settings.get().welcomeSeen)
      const contents = tab?.contents
      const seen = (await contents?.executeJavaScript(
        `(async () => {
          // Vrais clics, comme un utilisateur : thème Sakura, onglets en haut, DuckDuckGo.
          const click = (selector, text) => [...document.querySelectorAll(selector)].find((b) => b.textContent.includes(text)).click();
          click('.b-theme', 'Sakura');
          click('.b-segment button', 'En haut');
          click('.b-segment button', 'DuckDuckGo');
          const d = await window.kazeBienvenue.set({ userName: 'Test' });
          await new Promise((r) => setTimeout(r, 800));
          return JSON.stringify({ title: document.title, themes: d.themes.length, themeId: d.themeId, h1: document.querySelector('h1')?.textContent, selected: document.querySelector('.b-theme.is-selected')?.textContent, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() });
        })()`,
        true
      )) as string | undefined
      ok('Page affichée et réglages appliqués', !!seen && seen.includes('"themeId":"sakura"') && seen.includes('Bienvenue dans Kaze'), seen ?? 'aucune réponse')
      const s = services.settings.get()
      ok('Paramètres enregistrés', s.appearance.themeId === 'sakura' && s.appearance.tabPosition === 'haut' && s.searchEngine === 'duckduckgo' && s.userName === 'Test')
      await wait(2500)
      await shot('2-bienvenue-sakura')
      services.settings.setAppearance({ themeId: 'encre', tabPosition: 'gauche' })
      await wait(2500)
      await shot('3-bienvenue-encre')
      await contents?.executeJavaScript('window.kazeBienvenue.done()', true)
      await wait(2500)
      ok('« Commencer à naviguer » ouvre l’accueil', !!browser.currentTab()?.state.url.startsWith('kaze://accueil'), browser.currentTab()?.state.url ?? '')
      await wait(2000)
      await shot('4-accueil-apres')
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_EXT']) {
      // Extensions Chrome, par le vrai chemin de l'interface (IPC) : Store, scripts, popup, désactivation, suppression.
      type Ext = { path: string; name: string; loaded: boolean; hasPopup: boolean; icon: string | null; enabled: boolean; error: string | null }
      const ui = <T,>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true) as Promise<T>
      const install = (link: string): Promise<Ext | string> => ui(`window.kaze.invoke('ext:install', ${JSON.stringify(link)}).catch((e) => String(e))`)
      const dark = await install('https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh')
      ok('Dark Reader installé depuis le Store', typeof dark !== 'string' && dark.loaded && dark.hasPopup && !!dark.icon, typeof dark === 'string' ? dark : `${dark.name} chargé=${dark.loaded} popup=${dark.hasPopup} ${dark.error ?? ''}`)
      const react = await install('fmkadmapgofadopljbjfkapdkoienihi')
      ok('React Developer Tools installé (par identifiant)', typeof react !== 'string' && react.loaded, typeof react === 'string' ? react : `${react.name} ${react.error ?? ''}`)
      await wait(1500)
      const toolbar = await ui<number>("document.querySelectorAll('.ext-button').length")
      const loadedCount = (await ui<Ext[]>("window.kaze.invoke('ext:list')")).filter((e) => e.loaded).length
      ok('Un bouton par extension chargée dans la barre d’outils', toolbar === loadedCount, `${toolbar} bouton(s), ${loadedCount} extension(s)`)

      // Dark Reader assombrit une page claire sans thème sombre (la toute première page web, au CERN).
      // example.com ne convient pas : il a son propre thème sombre, que Dark Reader respecte.
      const id = browser.createTab({ url: 'http://info.cern.ch/hypertext/WWW/TheProject.html' })
      await wait(8000)
      const page = browser.get(id)!.contents!
      const styled = (await page.executeJavaScript(
        "JSON.stringify({ styles: document.querySelectorAll('style.darkreader, style[class*=darkreader]').length, fond: getComputedStyle(document.body).backgroundColor })",
        true
      )) as string
      ok('Dark Reader assombrit une page claire', /"styles":[1-9]/.test(styled) && !styled.includes('rgb(255, 255, 255)'), styled)
      // Mini-extension de test (préinstallée par le script de test) : un simple script de contenu.
      const mini = (await page.executeJavaScript('document.documentElement.dataset.kazeExt ?? null', true)) as string | null
      if (process.env['KAZE_AUTOTEST_EXT_MINI']) ok('Script de contenu d’une extension simple', mini === 'ok', String(mini))
      try {
        writeFileSync(join(dir, 'ext-page.png'), (await page.capturePage()).toPNG())
      } catch {
        // capture facultative
      }

      // Popup de Dark Reader sous son bouton.
      if (typeof dark !== 'string') {
        await ui(`(() => { const b = document.querySelector('.ext-button'); const r = b.getBoundingClientRect(); return window.kaze.invoke('ext:popup', ${JSON.stringify(dark.path)}, { x: r.x, y: r.y, width: r.width, height: r.height }) })()`)
        await wait(4000)
        const popup = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().startsWith('chrome-extension://'))
        const size = popup?.getContentSize()
        const text = popup ? ((await popup.webContents.executeJavaScript('document.body.innerText.slice(0, 120)', true)) as string) : ''
        // Ce que l'extension voit des onglets (chrome.tabs.query) depuis sa popup.
        const tabsSeen = popup
          ? ((await popup.webContents
              .executeJavaScript(
                "Promise.all([chrome.tabs.query({}), chrome.tabs.query({ active: true, currentWindow: true })]).then(([all, active]) => JSON.stringify({ all: all.map((t) => ({ id: t.id, url: t.url, active: t.active })), active: active.map((t) => ({ id: t.id, url: t.url })) })).catch((e) => 'erreur ' + e.message)",
                true
              )
              .catch((e: unknown) => String(e))) as string)
          : ''
        const tabContentsId = browser.get(id)?.contents?.id
        ok('L’extension voit l’onglet actif (chrome.tabs.query)', tabsSeen.includes('info.cern.ch') && tabsSeen.includes(`"id":${tabContentsId}`), `${tabsSeen.slice(0, 300)} (onglet = ${tabContentsId})`)
        ok('Popup de Dark Reader ouverte', !!popup && (size?.[0] ?? 0) > 100 && text.length > 0, popup ? `${size?.join('×')} « ${text.replace(/\s+/g, ' ').slice(0, 60)} »` : 'aucune fenêtre')
        if (popup) {
          try {
            writeFileSync(join(dir, 'ext-popup.png'), (await popup.webContents.capturePage()).toPNG())
          } catch {
            // capture facultative
          }
          popup.close()
        }
        // Désactivation puis réactivation.
        await ui(`window.kaze.invoke('ext:toggle', ${JSON.stringify(dark.path)}, false)`)
        const off = await ui<Ext[]>("window.kaze.invoke('ext:list')")
        ok('Désactivation', off.find((e) => e.path === dark.path)?.loaded === false)
      }
      if (typeof react !== 'string') {
        await ui(`window.kaze.invoke('ext:remove', ${JSON.stringify(react.path)})`)
        const after = await ui<Ext[]>("window.kaze.invoke('ext:list')")
        ok('Suppression (dossier effacé)', !after.some((e) => e.path === react.path) && !existsSync(react.path), `${after.length} restante(s)`)
      }
      // L'onglet Extensions des paramètres.
      win.webContents.send('ui:command', 'open-settings')
      await wait(1000)
      await ui("[...document.querySelectorAll('.settings__link')].find((b) => b.textContent.includes('Extensions'))?.click()")
      await wait(1500)
      try {
        writeFileSync(join(dir, 'ext-parametres.png'), (await win.webContents.capturePage()).toPNG())
      } catch {
        // capture facultative
      }
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_FONDS']) {
      // Galerie de fonds : chaque fond affiché sur la vraie page d'accueil, image bien dessinée.
      const id = browser.createTab({ url: 'kaze://accueil/' })
      await wait(2500)
      const page = browser.get(id)!.contents!
      const { settings } = services
      for (const w of WALLPAPERS) {
        const a = settings.get().appearance
        settings.setAppearance({ home: { ...a.home, background: 'galerie', wallpaper: w.id, dim: 0 } })
        await wait(900)
        const shown = (await page.executeJavaScript(
          `new Promise((resolve) => { const img = document.querySelector('img.fond'); if (!img) return resolve('aucune image'); const done = () => resolve(img.naturalWidth > 0 ? 'ok ' + img.naturalWidth : 'image vide'); img.complete ? done() : img.addEventListener('load', done, { once: true }); setTimeout(() => resolve('délai'), 3000) })`,
          true
        )) as string
        ok(`Fond ${w.name}`, shown.startsWith('ok'), shown)
        try {
          writeFileSync(join(dir, `fond-${w.id}.png`), (await page.capturePage()).toPNG())
        } catch (error) {
          ok(`capture ${w.id}`, false, String(error))
        }
      }
      // Anciens réglages sans « wallpaper » : l'accueil (widgets…) doit être conservé.
      const a = settings.get().appearance
      const { wallpaper: _oublie, ...ancien } = { ...a.home, shortcutsCount: 7 }
      settings.set({ appearance: { ...a, home: ancien as typeof a.home } })
      const repaired = settings.get().appearance.home
      ok('Anciens réglages : accueil conservé, fond par défaut', repaired.shortcutsCount === 7 && repaired.wallpaper === 'fuji', `${repaired.shortcutsCount} raccourcis, fond ${repaired.wallpaper}`)
      // La galerie dans Paramètres → Page d'accueil.
      win.webContents.send('ui:command', 'open-settings')
      await wait(1200)
      await win.webContents.executeJavaScript("[...document.querySelectorAll('.settings__link')].find((b) => b.textContent.includes('accueil'))?.click()", true)
      await wait(2500)
      const vignettes = (await win.webContents.executeJavaScript("document.querySelectorAll('.wallpaper img').length", true)) as number
      ok('Galerie des paramètres : une vignette par fond', vignettes === WALLPAPERS.length, String(vignettes))
      try {
        writeFileSync(join(dir, 'galerie-parametres.png'), (await win.webContents.capturePage()).toPNG())
      } catch (error) {
        ok('capture galerie', false, String(error))
      }
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_TEMPLATES']) {
      // Chaque template : réglages enregistrés tels quels (pas « réparés »), couleurs et CSS
      // arrivés dans l'interface, puis capture du look.
      for (const t of STYLE_TEMPLATES) {
        services.settings.setAppearance(templatePatch(services.settings.get().appearance, t))
        await wait(1500)
        const a = services.settings.get().appearance
        const ui = (await win.webContents.executeJavaScript(
          "({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), radius: getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(), rules: document.adoptedStyleSheets.reduce((n, s) => n + s.cssRules.length, 0) })",
          true
        )) as { accent: string; radius: string; rules: number }
        const saved = a.themeId === `template-${t.id}` && a.customCss === t.css && a.radius === t.look.radius && a.density === t.look.density && a.fonts.titles.family === (t.fonts.titles?.family ?? a.fonts.titles.family)
        ok(`${t.name} : réglages enregistrés`, saved, `${a.themeId} r=${a.radius} ${a.density} ${a.fonts.titles.family}`)
        ok(`${t.name} : couleurs et CSS appliqués`, ui.accent.toLowerCase() === t.colors.accent.toLowerCase() && ui.radius === `${t.look.radius}px` && ui.rules > 0, JSON.stringify(ui))
        await compositeShot(win, dir, `template-${t.id}`).catch((error: unknown) => ok(`capture ${t.id}`, false, String(error)))
      }
      // L'onglet Templates des paramètres.
      win.webContents.send('ui:command', 'open-settings')
      await wait(1200)
      await win.webContents.executeJavaScript("[...document.querySelectorAll('.settings__link')].find((b) => b.textContent.includes('Templates'))?.click()", true)
      await wait(1200)
      const cards = (await win.webContents.executeJavaScript("document.querySelectorAll('.template-card').length + ' cartes, actif : ' + (document.querySelector('.template-card.is-active h3')?.textContent ?? 'aucun')", true)) as string
      ok(`Onglet Templates : ${STYLE_TEMPLATES.length} cartes, la dernière appliquée est marquée`, cards.startsWith(`${STYLE_TEMPLATES.length} cartes`) && cards.includes(STYLE_TEMPLATES[STYLE_TEMPLATES.length - 1]!.name), cards)
      // Fenêtre flottante : seule l'interface compte (les pages sont gelées dessous).
      await wait(2500)
      try {
        writeFileSync(join(dir, 'templates-onglet.png'), (await win.webContents.capturePage()).toPNG())
      } catch (error) {
        ok('capture onglet Templates', false, String(error))
      }
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_OUVRIR']) {
      // « Ouvrir avec Kaze » : page-a.html passée au lancement, page-b.html envoyée ensuite par
      // une seconde instance (lancée par le script de test pendant cette attente).
      await wait(14_000)
      const find = (name: string): { url: string; title: string } | undefined => browser.getState().tabs.find((t) => t.url.startsWith('file:') && t.url.endsWith(name))
      const a = find('page-a.html')
      const b = find('page-b.html')
      ok('Fichier reçu au lancement ouvert', !!a && a.title === 'Page A', JSON.stringify(a))
      ok('Fichier envoyé par une seconde instance ouvert', !!b && b.title === 'Page B', JSON.stringify(b))
      ok('Une seule fenêtre Kaze', BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).length === 1)
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_RESPONSIVE']) {
      await testResponsive(dir, win, browser, services, ok)
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_DRM']) {
      await testDrm(browser, ok, shot)
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_VPN']) {
      await testVpn(win, browser, services, ok, shot)
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_PERF']) {
      // Mesures de fluidité de l'interface pendant le chargement de pages lourdes.
      const ui = win.webContents
      await ui.executeJavaScript(`
        window.__perf = { style: 0, states: 0, longTasks: 0, longMs: 0 };
        new MutationObserver((m) => (window.__perf.style += m.length)).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        window.kaze.on('browser:state', () => window.__perf.states++);
        new PerformanceObserver((list) => { for (const e of list.getEntries()) { window.__perf.longTasks++; window.__perf.longMs += e.duration } }).observe({ type: 'longtask', buffered: false });
      `)
      for (const url of ['https://www.lemonde.fr/', 'https://fr.wikipedia.org/wiki/Japon', 'https://www.google.com/search?q=navigateur+japonais']) {
        browser.createTab({ url })
      }
      await wait(10000)
      const during = (await ui.executeJavaScript('JSON.stringify(window.__perf)')) as string
      ok('Pendant le chargement de 3 pages (10 s)', true, during)
      const timing = (await ui.executeJavaScript(`(async () => {
        const t = (p) => { const s = performance.now(); return p.then(() => Math.round(performance.now() - s)) };
        const suggest = await t(window.kaze.invoke('suggest:query', 'wiki'));
        const freeze = await t(window.kaze.invoke('view:freeze'));
        const unfreeze = await t(window.kaze.invoke('view:unfreeze'));
        return JSON.stringify({ suggest, freeze, unfreeze });
      })()`)) as string
      ok('Temps (ms)', true, timing)
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_LANGUE']) {
      await langue(dir, win, browser, services)
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_VITRINE']) {
      await vitrine(dir, win, browser, services)
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_EMPREINTE']) {
      // Relevé de l'empreinte que voit la page de connexion Google.
      const id = browser.createTab({ url: 'https://accounts.google.com/' })
      await wait(9000)
      const print = (await browser.get(id)?.contents?.executeJavaScript(
        `(async () => {
          const r = {};
          const c = window.chrome;
          r.chrome = c ? Object.keys(c) : null;
          r.chromeTypes = c ? { app: typeof c.app, csi: typeof c.csi, loadTimes: typeof c.loadTimes, runtime: typeof c.runtime } : null;
          r.webdriver = navigator.webdriver;
          r.plugins = [...navigator.plugins].map((p) => p.name);
          r.mimeTypes = navigator.mimeTypes.length;
          r.pdfViewerEnabled = navigator.pdfViewerEnabled;
          r.cpu = navigator.hardwareConcurrency;
          r.memory = navigator.deviceMemory;
          r.languages = navigator.languages;
          r.notification = typeof Notification !== 'undefined' ? Notification.permission : 'absent';
          try { r.permNotif = (await navigator.permissions.query({ name: 'notifications' })).state } catch (e) { r.permNotif = String(e) }
          r.h264 = MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"');
          r.aac = MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"');
          try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]); r.widevine = true } catch { r.widevine = false }
          try {
            const gl = document.createElement('canvas').getContext('webgl');
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            r.webgl = [gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)];
          } catch (e) { r.webgl = String(e) }
          r.globals = { process: typeof process, require: typeof require, module: typeof module, Buffer: typeof Buffer, global: typeof global };
          const iframe = document.createElement('iframe'); document.body.appendChild(iframe);
          r.iframeChrome = typeof iframe.contentWindow.chrome; iframe.remove();
          r.connection = typeof navigator.connection; r.battery = typeof navigator.getBattery; r.share = typeof navigator.share;
          r.voices = speechSynthesis.getVoices().length;
          r.outer = [outerWidth, outerHeight, innerWidth, innerHeight];
          r.ua = navigator.userAgent;
          r.natif = [String(window.chrome && window.chrome.loadTimes), Function.prototype.toString.toString(), String(window.chrome && window.chrome.app && window.chrome.app.getDetails)];
          try { const lt = window.chrome.loadTimes(); r.loadTimes = [typeof lt.requestTime, lt.connectionInfo]; } catch (e) { r.loadTimes = String(e) }
          r.prototypeLoadTimes = window.chrome && 'prototype' in window.chrome.loadTimes;
          return JSON.stringify(r);
        })()`,
        true
      )) as string | undefined
      report.push(print ?? 'aucune réponse')
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    if (process.env['KAZE_AUTOTEST_GOOGLE']) {
      // Identité présentée à la page de connexion Google.
      // Identité présentée à la page de connexion Google : celle d'un Google Chrome standard.
      const id = browser.createTab({ url: 'https://accounts.google.com/' })
      await wait(9000)
      const contents = browser.get(id)?.contents
      const seen = (await contents?.executeJavaScript(
        `(async () => {
          const high = await navigator.userAgentData.getHighEntropyValues(['fullVersionList', 'platform', 'bitness']);
          return JSON.stringify({ ua: navigator.userAgent, brands: navigator.userAgentData.brands.map((b) => b.brand), full: high.fullVersionList.map((b) => b.brand + ' ' + b.version), platform: high.platform, vendor: navigator.vendor, page: location.pathname });
        })()`,
        true
      )) as string | undefined
      ok('Agent utilisateur de Chrome (format réduit)', !!seen && /Chrome\/\d+\.0\.0\.0 Safari/.test(seen) && !seen.includes('Electron'), seen ?? 'aucune réponse')
      ok('Client Hints avec la marque « Google Chrome »', !!seen && seen.includes('"brands":["Google Chrome"'))

      // En-têtes réellement envoyés au serveur.
      const headersTab = browser.createTab({ url: 'https://httpbin.org/headers' })
      await wait(5000)
      const raw = (await browser.get(headersTab)?.contents?.executeJavaScript('document.body.innerText', true)) as string | undefined
      let sent: Record<string, string> = {}
      try {
        sent = (JSON.parse(raw ?? '{}') as { headers: Record<string, string> }).headers
      } catch {
        // réponse illisible
      }
      ok('En-tête Sec-Ch-Ua avec « Google Chrome »', (sent['Sec-Ch-Ua'] ?? '').includes('Google Chrome'), sent['Sec-Ch-Ua'] ?? 'absent')
      ok('En-tête User-Agent de Chrome', /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(sent['User-Agent'] ?? ''), sent['User-Agent'] ?? 'absent')
      ok('En-tête Accept-Language', !!sent['Accept-Language'], sent['Accept-Language'] ?? 'absent')
      ok('Pas de Client Hints détaillés hors Google', !sent['Sec-Ch-Ua-Full-Version-List'])

      // Les outils de développement restent utilisables, puis l'identité revient.
      browser.toggleDevTools(headersTab)
      await wait(1500)
      browser.toggleDevTools(headersTab)
      await wait(1500)
      browser.get(headersTab)?.go('reload')
      await wait(3000)
      const after = (await browser.get(headersTab)?.contents?.executeJavaScript('navigator.userAgentData.brands.map((b) => b.brand).join(",")', true)) as string | undefined
      ok('Identité conservée après F12', !!after && after.includes('Google Chrome'), after ?? '')
      await shot('0-google')
      report.push('')
      writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
      app.quit()
      return
    }

    browser.openStudio()
    await wait(3000)
    const project = await services.studio.newProject('Projet test')
    ok('Projet créé', !!project.root, project.root ?? '')
    await wait(2500)

    const base = project.previewBase!
    const html = await (await net.fetch(base + 'index.html')).text()
    ok('Aperçu servi par le serveur local', html.includes('Bonjour'), base)
    ok('Script de rechargement injecté', html.includes('__kaze/live.js'))
    const refused = await net.fetch(base.replace(/\/[0-9a-f]+\/$/, '/index.html'))
    ok('Accès sans jeton refusé', refused.status === 403, `statut ${refused.status}`)

    // Aperçu en direct : contenu non enregistré servi à la place du fichier.
    services.studio.setOverlay('index.html', '<h1>Version non enregistrée</h1>')
    const overlay = await (await net.fetch(base + 'index.html')).text()
    ok('Contenu non enregistré servi en direct', overlay.includes('Version non enregistrée'))
    services.studio.setOverlay('index.html', null)

    let logs = 0
    services.studio.on('event', (e) => {
      if (e.type === 'log') logs++
    })
    await wait(3000)
    await shot('2-studio')
    ok('Console reçoit les logs de la page', logs > 0, `${logs} message(s)`)

    // Thème Sakura, onglets en haut, puis capture.
    services.settings.setAppearance({ themeMode: 'manuel', themeId: 'sakura', tabPosition: 'haut' })
    await wait(1500)
    await shot('3-sakura-haut')
    services.settings.setAppearance({ themeMode: 'manuel', themeId: 'encre', tabPosition: 'gauche' })
    // Le projet d'essai part à la Corbeille : rien ne reste dans Documents\Kaze Studio.
    if (project.root) await shell.trashItem(project.root)
  } catch (error) {
    report.push(`ERREUR  ${String((error as Error)?.stack ?? error)}`)
  }
  writeFileSync(join(dir, 'rapport.txt'), report.join('\n'), 'utf8')
  app.quit()
}

/**
 * Captures « vitrine » pour la page de présentation : l'interface et les pages des onglets
 * sont capturées séparément (ce sont des vues distinctes), puis assemblées en une image.
 */
/**
 * Mode responsive : trois appareils réels (largeur de page, agent mobile, tactile, densité),
 * placement dans la fenêtre, synchronisation du défilement et de la navigation, changement
 * d'appareils, puis retour à l'onglet à la dernière page.
 */
async function testResponsive(
  dir: string,
  win: BrowserWindow,
  browser: BrowserController,
  services: Services,
  ok: (label: string, value: boolean, detail?: string) => void
): Promise<void> {
  const { responsive, settings } = services
  // Capture facultative : Windows la refuse quand l'écran est en veille ou verrouillé.
  // Attention : en mode responsive, ces captures ne prouvent pas l'affichage réel à l'écran.
  const shot = (name: string): Promise<void> => compositeShot(win, dir, name).catch((error: unknown) => ok(`capture ${name}`, false, String(error)))
  settings.set({ responsiveDevices: [{ id: 'iphone-15', rotated: false }, { id: 'ipad-air', rotated: false }, { id: 'laptop', rotated: false }] })
  const tab = browser.currentTab()!
  // Page prévue pour le mobile (balise viewport « device-width ») : la largeur de page doit
  // être exactement celle de l'appareil.
  tab.load('https://example.com/')
  await wait(4000)
  browser.toggleResponsive(tab.id)
  await wait(8000)
  const views = responsive.views
  ok('Trois appareils', views.length === 3 && browser.getState().responsive?.devices.length === 3)
  type Probe = { w: number; dpr: number; touch: number; ua: string; url: string; y: number; max: number }
  const probe = (i: number): Promise<Probe> => {
    const contents = views[i]!.webContents
    return Promise.race([
      contents.executeJavaScript(
        '({ w: innerWidth, dpr: devicePixelRatio, touch: navigator.maxTouchPoints, ua: navigator.userAgent, url: location.href, y: scrollY, max: document.documentElement.scrollHeight - innerHeight })',
        true
      ) as Promise<Probe>,
      wait(5000).then(() => ({ w: -1, dpr: 0, touch: 0, ua: `sans réponse (chargement ${contents.isLoading()}, ${contents.getURL()})`, url: contents.getURL(), y: 0, max: 1 }))
    ])
  }
  const [phone, tablet, laptop] = await Promise.all([probe(0), probe(1), probe(2)])
  // ±1 px : la largeur visible arrondie dépend de l'échelle d'affichage. La densité d'écran
  // (devicePixelRatio) n'est pas vérifiée : Chromium ignore son émulation dans les vues Electron.
  ok('iPhone : 393 px, tactile, agent iPhone', Math.abs(phone.w - 393) <= 1 && phone.touch > 0 && phone.ua.includes('iPhone'), JSON.stringify({ w: phone.w, dpr: phone.dpr, touch: phone.touch }))
  ok('iPad Air : 820 px, agent iPad', Math.abs(tablet.w - 820) <= 1 && tablet.ua.includes('iPad'), JSON.stringify({ w: tablet.w, dpr: tablet.dpr }))
  ok('Portable : 1366 px, pas tactile, agent Chrome bureau', laptop.w === 1366 && laptop.touch === 0 && laptop.ua.includes('Windows NT'), `${laptop.w}`)
  const bounds = views.map((v) => v.getBounds())
  const [cw, ch] = win.getContentSize()
  const inside = bounds.every((b) => b.width > 50 && b.x >= 0 && b.y >= 0 && b.x + b.width <= cw! && b.y + b.height <= ch!)
  const ratio = bounds[0]!.width / 393
  ok('Appareils placés dans la fenêtre, même échelle', inside && Math.abs(bounds[2]!.width / 1366 - ratio) < 0.01, JSON.stringify(bounds))
  await shot('responsive-1')

  // Barre d'adresse : la page s'ouvre sur tous les appareils, et chaque serveur reçoit
  // l'agent de son appareil (httpbin renvoie les en-têtes reçus).
  browser.navigate(tab.id, 'https://httpbin.org/headers')
  await wait(6000)
  const seen = await Promise.all(
    views.map((v) => Promise.race([v.webContents.executeJavaScript('document.body.innerText', true) as Promise<string>, wait(5000).then(() => '')]))
  )
  const agent = (body: string): string => /"User-Agent": "([^"]+)"/.exec(body)?.[1] ?? '?'
  ok(
    'Le serveur reçoit l’agent de chaque appareil',
    agent(seen[0]!).includes('iPhone') && agent(seen[1]!).includes('iPad') && agent(seen[2]!).includes('Windows NT'),
    seen.map(agent).join(' | ')
  )

  // Défilement : l'iPhone descend à mi-page, les autres suivent en proportion.
  browser.navigate(tab.id, 'https://fr.wikipedia.org/wiki/Vent')
  await wait(7000)
  // L'évènement « scroll » n'est émis qu'au rafraîchissement de l'affichage : écran éteint ou
  // verrouillé, il ne part jamais. On l'envoie donc aussi soi-même (le preload le reçoit pareil).
  await views[0]!.webContents.executeJavaScript(
    "window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2); window.dispatchEvent(new Event('scroll'))",
    true
  )
  await wait(1200)
  const [p2, t2, l2] = await Promise.all([probe(0), probe(1), probe(2)])
  ok(
    'Défilement synchronisé',
    t2.y / t2.max > 0.4 && t2.y / t2.max < 0.6 && l2.y / l2.max > 0.4 && l2.y / l2.max < 0.6,
    `iPhone ${(p2.y / p2.max).toFixed(2)} (${p2.y}/${p2.max}), iPad ${(t2.y / t2.max).toFixed(2)}, portable ${(l2.y / l2.max).toFixed(2)}`
  )

  // Navigation : un lien suivi sur le portable emmène les autres appareils.
  await views[2]!.webContents.executeJavaScript("location.href = 'https://fr.wikipedia.org/wiki/Brise_(vent)'", true)
  await wait(6000)
  const [p3, t3, l3] = await Promise.all([probe(0), probe(1), probe(2)])
  ok('Navigation synchronisée', [p3, t3, l3].every((p) => p.url.includes('Brise')), [p3.url, t3.url, l3.url].join(' | '))
  const followed = browser.getState().tabs.find((t) => t.id === tab.id)!
  ok('L’onglet suit l’adresse et le titre', followed.url.includes('Brise') && followed.title.includes('Brise'), `${followed.url} — ${followed.title}`)
  await shot('responsive-2')

  // Saisie et clic : de vraies frappes clavier (évènements « de confiance ») dans le
  // formulaire du portable doivent se retrouver sur les autres appareils.
  browser.navigate(tab.id, 'https://httpbin.org/forms/post')
  await wait(6000)
  // Frappes envoyées par le protocole DevTools : de vrais évènements clavier, même si la
  // fenêtre de test (invisible) n'a pas le focus de Windows.
  const laptopView = views[2]!.webContents
  const cdp = (method: string, params: object): Promise<unknown> => laptopView.debugger.sendCommand(method, params)
  await laptopView.executeJavaScript("document.querySelector('input[name=custname]').focus()", true)
  await cdp('Input.insertText', { text: 'Kaze' })
  // Vrai clic de souris au centre de la case (coordonnées en pixels CSS de la page émulée).
  const box = (await laptopView.executeJavaScript(
    "(() => { const r = document.querySelector('input[value=bacon]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()",
    true
  )) as { x: number; y: number }
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await wait(1500)
  const form = await Promise.all(
    views.map(
      (v) =>
        Promise.race([
          v.webContents.executeJavaScript("({ name: document.querySelector('input[name=custname]')?.value, bacon: document.querySelector('input[value=bacon]')?.checked })", true),
          wait(4000).then(() => null)
        ]) as Promise<{ name: string; bacon: boolean } | null>
    )
  )
  ok('Saisie synchronisée', form.every((f) => f?.name === 'Kaze'), JSON.stringify(form))
  ok('Clic synchronisé (case cochée partout)', form.every((f) => f?.bacon === true), JSON.stringify(form))

  // Changement d'appareils : Pixel 8 en paysage + écran Full HD.
  settings.set({ responsiveDevices: [{ id: 'pixel-8', rotated: true }, { id: 'desktop', rotated: false }] })
  await wait(2000)
  browser.navigate(tab.id, 'https://example.com/')
  await wait(6000)
  const v2 = responsive.views
  const pixel = (await v2[0]!.webContents.executeJavaScript('({ w: innerWidth, ua: navigator.userAgent })', true)) as { w: number; ua: string }
  ok('Pixel 8 paysage : 915 px, agent Android', v2.length === 2 && pixel.w === 915 && pixel.ua.includes('Android'), JSON.stringify(pixel))
  await shot('responsive-3')

  browser.toggleResponsive(tab.id)
  await wait(4000)
  ok('Quitter : plus d’appareils, onglet à la dernière page', responsive.views.length === 0 && browser.getState().responsive === null && !!tab.contents?.getURL().includes('example.com'), tab.contents?.getURL() ?? '')
  await shot('responsive-4')

  // Fichier .html local (file://), ouvert depuis le disque.
  const file = join(dir, 'page-locale.html')
  writeFileSync(file, '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page locale</title><h1>Bonjour</h1>', 'utf8')
  const fileUrl = pathToFileURL(file).href
  tab.load(fileUrl)
  await wait(2500)
  browser.toggleResponsive(tab.id)
  await wait(6000)
  const local = await Promise.all(
    responsive.views.map(
      (v) =>
        Promise.race([v.webContents.executeJavaScript('({ w: innerWidth, url: location.href, h1: document.querySelector("h1")?.textContent })', true), wait(4000).then(() => null)]) as Promise<{
          w: number
          url: string
          h1: string
        } | null>
    )
  )
  ok('Fichier .html local sur tous les appareils', local.length === 2 && local.every((l) => l?.url === fileUrl && l.h1 === 'Bonjour'), JSON.stringify(local))
  browser.toggleResponsive(tab.id)
  await wait(1000)
}

/**
 * DRM : le module Widevine est installé, la page obtient l'accès au système de clés, puis
 * lit une vraie vidéo chiffrée (flux de démonstration de Shaka Player, licence sans compte).
 */
async function testDrm(
  browser: BrowserController,
  ok: (label: string, value: boolean, detail?: string) => void,
  shot: (name: string) => Promise<void>
): Promise<void> {
  const start = Date.now()
  const results = await components.whenReady([components.WIDEVINE_CDM_ID]).catch((error: unknown) => String(error))
  ok('Module Widevine prêt', typeof results !== 'string', `${((Date.now() - start) / 1000).toFixed(1)} s, ${JSON.stringify(components.status())}`)
  const contents = browser.currentTab()!.contents!
  await contents.loadURL('https://example.com/').catch(() => undefined)
  await wait(1500)
  const access = (await contents.executeJavaScript(
    `navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: 'SW_SECURE_CRYPTO' }] }])
      .then((a) => a.createMediaKeys().then(() => 'ok ' + a.keySystem), (e) => 'refus ' + e.name + ' ' + e.message)`,
    true
  )) as string
  ok('Accès Widevine depuis une page', access.startsWith('ok'), access)
  const played = (await contents.executeJavaScript(
    `new Promise((resolve) => {
      document.body.innerHTML = '<video id="v" muted autoplay style="width:100%"></video>';
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.11.7/shaka-player.compiled.js';
      s.onerror = () => resolve('shaka introuvable');
      s.onload = async () => {
        try {
          const video = document.getElementById('v');
          const player = new shaka.Player();
          const errors = [];
          player.addEventListener('error', (ev) => errors.push(ev.detail && ev.detail.code));
          video.addEventListener('error', () => errors.push('video ' + (video.error && video.error.message)));
          window.__etat = () => JSON.stringify({ time: video.currentTime, width: video.videoWidth, drm: player.drmInfo() && player.drmInfo().keySystem, readyState: video.readyState, paused: video.paused, frames: video.getVideoPlaybackQuality().totalVideoFrames, keys: player.getKeyStatuses(), errors });
          await player.attach(video);
          player.configure({ drm: { servers: { 'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth' } } });
          await player.load('https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd');
          await video.play().catch((e) => errors.push('play ' + e.name + ' ' + e.message));
          errors.push('visibilite ' + document.visibilityState);
          setTimeout(() => resolve(window.__etat()), 10000);
        } catch (e) { resolve('erreur ' + (e.code || '') + ' ' + (e.message || e)); }
      };
      document.head.appendChild(s);
    })`,
    true
  )) as string
  ok('Vidéo Widevine lue', /"time":([1-9]|0\.[1-9])/.test(played) && played.includes('com.widevine.alpha'), played)
  await shot('drm-1-video')
}

/**
 * Brume (VPN) : connexion réelle à Tor, adresse IP changée, WebRTC limité, pays de sortie,
 * coupure de sécurité quand Tor s'arrête, puis retour en direct. L'IP réelle n'est jamais
 * écrite dans le rapport (seulement comparée).
 */
async function testVpn(
  win: BrowserWindow,
  browser: BrowserController,
  services: Services,
  ok: (label: string, value: boolean, detail?: string) => void,
  shot: (name: string) => Promise<void>
): Promise<void> {
  const contents = browser.currentTab()!.contents!
  const ses = contents.session
  const ipCheck = async (): Promise<{ IsTor?: boolean; IP?: string } | string> => {
    try {
      const r = await ses.fetch('https://check.torproject.org/api/ip', { cache: 'no-store' })
      return (await r.json()) as { IsTor?: boolean; IP?: string }
    } catch (error) {
      return String(error)
    }
  }
  const until = async (status: string, ms: number): Promise<number> => {
    const start = Date.now()
    while (Date.now() - start < ms && services.vpn.state.status !== status) await wait(250)
    return Date.now() - start
  }

  const direct = await ipCheck()
  ok('Direct : pas Tor', typeof direct === 'object' && direct.IsTor === false, typeof direct === 'string' ? direct : '')
  const realIp = typeof direct === 'object' ? direct.IP : undefined

  services.settings.set({ vpn: { enabled: true, country: 'auto' } })
  await wait(300)
  ok('Connexion en cours', services.vpn.state.status === 'connexion', JSON.stringify(services.vpn.state))
  emitUi(win, 'open-vpn')
  await wait(1500)
  await shot('vpn-1-connexion')
  const t = await until('actif', 130_000)
  ok('Brume active', services.vpn.state.status === 'actif', `${(t / 1000).toFixed(1)} s, ${JSON.stringify(services.vpn.state)}`)
  await wait(3000)
  const tor = await ipCheck()
  ok('Trafic via Tor', typeof tor === 'object' && tor.IsTor === true, typeof tor === 'string' ? tor : '')
  ok('IP différente de la vraie', typeof tor === 'object' && !!tor.IP && tor.IP !== realIp)
  // Tor peut sortir par un autre relais d'une requête à l'autre : on vérifie juste qu'une IP Tor est connue.
  ok('IP de sortie affichée', !!services.vpn.state.ip && services.vpn.state.ip !== realIp, `état ${services.vpn.state.ip}, test ${typeof tor === 'object' ? tor.IP : '?'}`)
  ok('WebRTC limité au proxy', contents.getWebRTCIPHandlingPolicy() === 'disable_non_proxied_udp')
  await shot('vpn-2-actif')
  closeDialog(win)
  await contents.loadURL('https://check.torproject.org/').catch(() => undefined)
  await wait(1500)
  const title = (await contents.executeJavaScript('document.querySelector("h1")?.textContent.trim() ?? document.title', true)) as string
  ok('check.torproject.org dans un onglet', /Congratulations/i.test(title), title)
  await shot('vpn-3-check')

  services.settings.set({ vpn: { enabled: true, country: 'ch' } })
  await wait(300)
  const t2 = await until('actif', 130_000)
  await until('actif', 1000)
  const start = Date.now()
  while (Date.now() - start < 20_000 && !services.vpn.state.country) await wait(250)
  ok('Pays de sortie Suisse', services.vpn.state.status === 'actif' && services.vpn.state.country === 'ch', `${(t2 / 1000).toFixed(1)} s, ${JSON.stringify(services.vpn.state)}`)
  emitUi(win, 'open-vpn')
  await wait(1500)
  await shot('vpn-3b-suisse')
  closeDialog(win)
  await wait(500)

  // Coupure de sécurité : Tor tué, les pages ne doivent pas repartir en direct.
  ;(services.vpn as unknown as { child: { kill: () => void } }).child.kill()
  await until('erreur', 10_000)
  ok('Tor arrêté → erreur', services.vpn.state.status === 'erreur', services.vpn.state.error ?? '')
  const leak = await ipCheck()
  ok('Aucune fuite quand Tor est coupé', typeof leak === 'string', typeof leak === 'string' ? leak.slice(0, 80) : `réponse reçue, IsTor=${leak.IsTor}`)
  emitUi(win, 'open-vpn')
  await wait(1500)
  await shot('vpn-4-erreur')
  closeDialog(win)

  services.settings.set({ vpn: { enabled: false, country: 'auto' } })
  await until('eteint', 10_000)
  const back = await ipCheck()
  ok('Désactivée : retour en direct', typeof back === 'object' && back.IsTor === false && back.IP === realIp)
  ok('WebRTC normal', contents.getWebRTCIPHandlingPolicy() === 'default')
}

function emitUi(win: BrowserWindow, command: 'open-vpn'): void {
  win.webContents.send('ui:command', command)
}

/** Ferme la fenêtre flottante ouverte (touche Échap). */
function closeDialog(win: BrowserWindow): void {
  win.webContents.focus()
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
}

/**
 * Capture composée : l'interface plus les pages natives posées par-dessus (capturePage de la
 * fenêtre ne voit que l'interface). Enregistrée en <dir>/<name>.jpg.
 */
async function compositeShot(win: BrowserWindow, dir: string, name: string): Promise<void> {
  const helper = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await helper.loadURL('about:blank')
    const ui = await win.webContents.capturePage()
    const scale = ui.getSize().width / win.getContentBounds().width
    const layers: { image: string; sw: number; sh: number; x: number; y: number; w: number; h: number }[] = []
    for (const view of win.contentView.children) {
      if (!(view instanceof WebContentsView)) continue
      const b = view.getBounds()
      const shot = await view.webContents.capturePage()
      // Une vue émulée (mode responsive) se capture à la taille de l'écran de l'appareil, alors
      // que l'écran n'en montre que le coin haut-gauche (la taille de la vue) : on recadre.
      const size = shot.getSize()
      layers.push({ image: shot.toDataURL(), sw: Math.min(size.width, b.width * scale), sh: Math.min(size.height, b.height * scale), x: b.x * scale, y: b.y * scale, w: b.width * scale, h: b.height * scale })
    }
    const jpeg = (await helper.webContents.executeJavaScript(`(async () => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src });
      const base = await load(${JSON.stringify(ui.toDataURL())});
      const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
      const g = c.getContext('2d'); g.drawImage(base, 0, 0);
      for (const l of ${JSON.stringify(layers)}) {
        const img = await load(l.image);
        g.save(); g.beginPath(); g.roundRect(l.x, l.y, l.w, l.h, 10 * ${scale}); g.clip();
        g.drawImage(img, 0, 0, l.sw, l.sh, l.x, l.y, l.w, l.h); g.restore();
      }
      return c.toDataURL('image/jpeg', 0.86);
    })()`)) as string
    writeFileSync(join(dir, `${name}.jpg`), Buffer.from(jpeg.split(',')[1]!, 'base64'))
  } finally {
    helper.destroy()
  }
}

/**
 * Relève les textes affichés (interface, chaque section des paramètres, Souffle, tiroirs, pages
 * internes) et signale les lignes qui ont l'air françaises. À lancer avec un profil réglé en anglais.
 */
async function langue(dir: string, win: BrowserWindow, browser: BrowserController, services: Services): Promise<void> {
  const textes: string[] = []
  const ui = (code: string): Promise<string> => win.webContents.executeJavaScript(code) as Promise<string>
  const page = async (input: string): Promise<void> => {
    const id = browser.createTab({ url: input })
    await wait(4000)
    textes.push(`## ${input}`, ((await browser.get(id)?.contents?.executeJavaScript('document.body.innerText')) as string) ?? '')
  }
  await page('kaze://accueil/')
  await page('kaze://bienvenue/')
  await page('kaze://studio/')
  textes.push('## interface', await ui('document.body.innerText'))
  for (const command of ['open-history', 'open-bookmarks', 'open-downloads', 'open-souffle'] as const) {
    browser.uiCommand(command)
    await wait(1200)
    textes.push(`## ${command}`, await ui('document.body.innerText'))
    await ui("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ''")
    await wait(500)
  }
  browser.uiCommand('open-settings')
  await wait(1500)
  textes.push(
    '## paramètres',
    await ui(`(async () => {
      const out = [];
      for (const link of document.querySelectorAll('.settings__link')) {
        link.click();
        await new Promise((r) => setTimeout(r, 400));
        out.push('# ' + link.innerText, document.querySelector('.settings')?.innerText ?? document.body.innerText);
      }
      return out.join('\\n');
    })()`)
  )
  writeFileSync(join(dir, 'textes.txt'), textes.join('\n'), 'utf8')
  const francais = /[éèêàçùâîôûœ«»]|\b(le|la|les|des|du|une|et|pour|avec|dans|sur|vos|votre|est|pas)\b/i
  const suspects = [...new Set(textes.join('\n').split('\n').map((l) => l.trim()))].filter((l) => francais.test(l))
  // Changement de langue en cours de route : l'interface doit se recharger dans l'autre langue.
  const avant = services.settings.get().language
  services.settings.set({ language: avant === 'en' ? 'fr' : 'en' })
  await wait(4000)
  const apres = await ui('document.body.innerText')
  const bascule = avant === 'en' ? apres.includes('Nouvel onglet') : apres.includes('New tab')
  writeFileSync(
    join(dir, 'rapport.txt'),
    [`${suspects.length} ligne(s) suspecte(s)`, ...suspects, '', `${bascule ? 'OK' : 'ÉCHEC'}  Bascule de langue en direct`].join('\n'),
    'utf8'
  )
}

async function vitrine(dir: string, win: BrowserWindow, browser: BrowserController, services: Services): Promise<void> {
  const composite = (name: string): Promise<void> => compositeShot(win, dir, name)

  const { bookmarks, studio, settings } = services
  bookmarks.add('https://fr.wikipedia.org/', 'Wikipédia', 'https://fr.wikipedia.org/static/favicon/wikipedia.ico')
  bookmarks.add('https://developer.mozilla.org/fr/', 'MDN', 'https://developer.mozilla.org/favicon.ico')
  bookmarks.add('https://github.com/KobeStars/kaze', 'GitHub', 'https://github.githubassets.com/favicons/favicon.svg')
  bookmarks.add('https://www.youtube.com/', 'YouTube', 'https://www.youtube.com/s/desktop/favicon.ico')
  bookmarks.add('https://www.figma.com/', 'Figma', 'https://static.figma.com/app/icon/1/favicon.svg')
  bookmarks.add('https://claude.ai/', 'Claude', 'https://claude.ai/favicon.ico')

  const wiki = browser.createTab({ url: 'https://fr.wikipedia.org/wiki/Kaze', activate: false })
  const mdn = browser.createTab({ url: 'https://developer.mozilla.org/fr/docs/Web/HTML', activate: false })
  browser.createTab({ url: 'https://github.com/KobeStars/kaze', activate: false })
  const home = browser.createTab({})
  win.webContents.focus()
  await wait(9000)
  await composite('kaze-accueil')

  browser.activate(wiki)
  browser.openSplit(mdn)
  await wait(5000)
  await composite('kaze-split')
  browser.closeSplit()

  browser.activate(wiki)
  await wait(2000)
  browser.uiCommand('open-souffle')
  await wait(2500)
  await composite('kaze-souffle')
  browser.uiCommand('open-souffle')
  await wait(1000)

  const project = await studio.newProject('Démo Kaze')
  browser.openStudio()
  await wait(3500)
  studio.emit('event', { type: 'open-file', path: 'index.html' })
  await wait(4000)
  await composite('kaze-studio')

  settings.setAppearance({ themeMode: 'manuel', themeId: 'sakura', tabPosition: 'haut' })
  browser.activate(home)
  await wait(6000)
  await composite('kaze-sakura')
  settings.setAppearance({ themeMode: 'manuel', themeId: 'encre', tabPosition: 'gauche' })
  if (project.root) await shell.trashItem(project.root)

  // Mode responsive : la page de présentation de Kaze sur un téléphone, une tablette et un portable.
  settings.set({ responsiveDevices: [{ id: 'iphone-15', rotated: false }, { id: 'ipad-mini', rotated: false }, { id: 'laptop', rotated: false }] })
  const site = browser.createTab({ url: 'https://kobestars.github.io/kaze/' })
  await wait(4000)
  browser.toggleResponsive(site)
  await wait(10000)
  await composite('kaze-responsive')
  browser.toggleResponsive(site)
}

/**
 * Génère toutes les déclinaisons du logo de Kaze, sans aucun outil externe :
 * le script tourne dans Electron et utilise un canvas caché.
 *
 * Utilisation : npm run logo
 *
 * 1. Si assets/logo/kaze-logo.(png|jpg|webp) existe (le logo officiel sur papier washi) :
 *    - détourage automatique : le papier devient transparent, l'encre et le sceau restent ;
 *    - le slogan sous le kanji est retiré (on ne garde que le bloc kanji + sceau) ;
 *    - versions claire (encre noire) et sombre (encre #F5F2EB, sceau vermillon) pour l'interface ;
 *    - le logo complet est copié pour l'écran de démarrage.
 * 2. Sinon : icônes provisoires dessinées avec le 風 de la police Shippori Mincho.
 *
 * Icônes de l'application (build/) : 16, 24, 32 px = kanji seul (lisible en petit) ;
 * 48 à 256 px = kanji + sceau ; plus build/icon.ico pour electron-builder.
 */
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSIONS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const trouve = Object.keys(EXTENSIONS).find((ext) => existsSync(join(racine, `assets/logo/kaze-logo.${ext}`)))
const source = trouve ? join(racine, `assets/logo/kaze-logo.${trouve}`) : null
const mime = trouve ? EXTENSIONS[trouve] : null
const sortieUi = join(racine, 'src/renderer/src/assets/logo')
const sortieBuild = join(racine, 'build')
const TAILLES = [16, 24, 32, 48, 64, 128, 256]

/** Fichier woff2 de Shippori Mincho (graisse 700) qui contient le caractère 風. */
function policeKanji() {
  const css = readFileSync(join(racine, 'src/renderer/src/styles/polices-jp.css'), 'utf8')
  for (const bloc of css.split('@font-face').slice(1)) {
    if (!/font-weight:\s*700/.test(bloc)) continue
    const range = /unicode-range:\s*([^;]+);/.exec(bloc)?.[1] ?? ''
    const contient = range.split(',').some((p) => {
      const [d, f] = p.trim().replace(/^U\+/i, '').split('-')
      return 0x98a8 >= parseInt(d, 16) && 0x98a8 <= parseInt(f ?? d, 16)
    })
    if (contient) {
      const fichier = /jp\/([^']+\.woff2)/.exec(bloc)[1]
      return readFileSync(join(racine, 'src/renderer/src/assets/fonts/jp', fichier)).toString('base64')
    }
  }
  throw new Error('Police du kanji introuvable : lancez d’abord « npm run polices ».')
}

/** Code exécuté dans la page cachée : tout le travail d'image se fait sur canvas. */
const TRAVAIL = String.raw`
async (logoBase64, mime, policeBase64, tailles) => {
  const VERMILLON = [215, 55, 42]
  const WASHI = [245, 242, 235]

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const png = (c) => c.toDataURL('image/png')

  // ----- 1. Calque « encre + sceau » sur fond transparent -----
  let encre // canvas RGBA : noir (encre) et vermillon (sceau), fond transparent
  let sceauMasque // même taille : uniquement les pixels du sceau

  if (logoBase64) {
    const img = new Image()
    img.src = 'data:' + mime + ';base64,' + logoBase64
    await img.decode()
    const W = img.naturalWidth, H = img.naturalHeight
    const src = canvas(W, H); const sctx = src.getContext('2d')
    sctx.drawImage(img, 0, 0)
    const data = sctx.getImageData(0, 0, W, H)
    const p = data.data

    // Couleur du papier : moyenne des pixels les plus clairs du bord.
    const bord = []
    for (let x = 0; x < W; x += 4) { bord.push(x * 4, ((H - 1) * W + x) * 4) }
    const lum = (i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]
    const papier = bord.map(lum).sort((a, b) => b - a).slice(0, Math.max(10, bord.length / 4))
    const lumPapier = papier.reduce((a, b) => a + b, 0) / papier.length

    const alpha = new Float32Array(W * H)
    const rouge = new Uint8Array(W * H)
    for (let i = 0, k = 0; i < p.length; i += 4, k++) {
      const r = p[i], g = p[i + 1], b = p[i + 2]
      if (r > 110 && r - g > 55 && r - b > 45) {
        rouge[k] = 1
        alpha[k] = Math.min(1, (r - g - 30) / 110)
      } else {
        let a = (lumPapier - lum(i)) / (lumPapier - 18)
        a = Math.max(0, Math.min(1, a))
        // Les fibres du papier sont à peine plus sombres : on les efface.
        alpha[k] = a < 0.16 ? 0 : Math.pow((a - 0.16) / 0.84, 0.85)
      }
    }

    // On garde le plus grand bloc de lignes encrées (le kanji + sceau), pas le slogan.
    const lignes = new Array(H).fill(0)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.5) lignes[y]++
    const blocs = []
    let debut = -1, vide = 0
    const seuilVide = Math.round(H * 0.035)
    for (let y = 0; y < H; y++) {
      if (lignes[y] > 1) { if (debut < 0) debut = y; vide = 0 }
      else if (debut >= 0 && ++vide > seuilVide) { blocs.push([debut, y - vide]); debut = -1; vide = 0 }
    }
    if (debut >= 0) blocs.push([debut, H - 1])
    const [y0, y1] = blocs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]

    let x0 = W, x1 = 0, yy0 = H, yy1 = 0
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 0.2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); yy0 = Math.min(yy0, y); yy1 = Math.max(yy1, y) }
    }
    const cw = x1 - x0 + 1, ch = yy1 - yy0 + 1
    encre = canvas(cw, ch); sceauMasque = canvas(cw, ch)
    const e = encre.getContext('2d').createImageData(cw, ch)
    const s = sceauMasque.getContext('2d').createImageData(cw, ch)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = (y + yy0) * W + (x + x0), o = (y * cw + x) * 4
      const a = Math.round(alpha[k] * 255)
      if (rouge[k]) { s.data.set([...VERMILLON, a], o); e.data.set([...VERMILLON, a], o) }
      else e.data.set([17, 17, 17, a], o)
    }
    encre.getContext('2d').putImageData(e, 0, 0)
    sceauMasque.getContext('2d').putImageData(s, 0, 0)
  } else {
    // Repli : le 風 de la police + un sceau vermillon dessiné.
    const bytes = Uint8Array.from(atob(policeBase64), (c) => c.charCodeAt(0))
    const police = new FontFace('KazeMincho', bytes.buffer, { weight: '700' })
    await police.load(); document.fonts.add(police)
    encre = canvas(1000, 1000); sceauMasque = canvas(1000, 1000)
    const c = encre.getContext('2d')
    c.fillStyle = '#111'; c.font = '700 860px KazeMincho'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'
    c.fillText('風', 470, 800)
    const sc = sceauMasque.getContext('2d')
    for (const ctx of [c, sc]) {
      ctx.fillStyle = 'rgb(' + VERMILLON + ')'
      ctx.beginPath(); ctx.roundRect(800, 700, 150, 190, 18); ctx.fill()
      ctx.fillStyle = 'rgb(' + WASHI + ')'; ctx.font = '700 120px KazeMincho'; ctx.textAlign = 'center'
      ctx.fillText('風', 875, 835)
    }
  }

  // ----- 2. Déclinaisons -----
  /** Kanji seul : on retire le sceau. */
  const sansSceau = () => {
    const c = canvas(encre.width, encre.height); const ctx = c.getContext('2d')
    ctx.drawImage(encre, 0, 0)
    ctx.globalCompositeOperation = 'destination-out'
    // Le sceau est retiré avec une petite marge pour ne pas laisser de liseré.
    ctx.filter = 'blur(2px)'; ctx.drawImage(sceauMasque, 0, 0); ctx.drawImage(sceauMasque, 0, 0)
    return c
  }
  /** Recolore l'encre (le vermillon du sceau est conservé). */
  const recolorer = (calque, couleur) => {
    const c = canvas(calque.width, calque.height); const ctx = c.getContext('2d')
    ctx.drawImage(calque, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < d.data.length; i += 4) {
      const estSceau = d.data[i] > 150 && d.data[i + 1] < 120
      if (!estSceau && d.data[i + 3] > 0) { d.data[i] = couleur[0]; d.data[i + 1] = couleur[1]; d.data[i + 2] = couleur[2] }
    }
    ctx.putImageData(d, 0, 0)
    return c
  }
  /** Recadre au plus juste puis centre dans un carré avec une marge. */
  const carre = (calque, taille, marge) => {
    const ctx0 = calque.getContext('2d'); const d = ctx0.getImageData(0, 0, calque.width, calque.height).data
    let x0 = calque.width, y0 = calque.height, x1 = 0, y1 = 0
    for (let y = 0; y < calque.height; y++) for (let x = 0; x < calque.width; x++) {
      if (d[(y * calque.width + x) * 4 + 3] > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const c = canvas(taille, taille); const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    const echelle = (taille * (1 - 2 * marge)) / Math.max(w, h)
    // Réduction en plusieurs passes pour rester net en très petite taille.
    let etape = calque, ex = x0, ey = y0, ew = w, eh = h
    // On divise par deux tant que la taille finale est inférieure à la moitié de la taille courante.
    while ((w * echelle) / ew < 0.5) {
      const t = canvas(Math.ceil(ew / 2), Math.ceil(eh / 2)); const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'
      tc.drawImage(etape, ex, ey, ew, eh, 0, 0, t.width, t.height)
      etape = t; ex = 0; ey = 0; ew = t.width; eh = t.height
    }
    const dw = w * echelle, dh = h * echelle
    ctx.drawImage(etape, ex, ey, ew, eh, (taille - dw) / 2, (taille - dh) / 2, dw, dh)
    return c
  }

  const kanji = sansSceau()
  const sortie = {
    ui: {
      'kanji-encre.png': png(carre(kanji, 256, 0.04)),
      'kanji-washi.png': png(carre(recolorer(kanji, WASHI), 256, 0.04)),
      'kanji-encre-sceau.png': png(carre(encre, 512, 0.04)),
      'kanji-washi-sceau.png': png(carre(recolorer(encre, WASHI), 512, 0.04))
    },
    icones: {}
  }
  for (const t of tailles) {
    // En petit, le sceau deviendrait une tache : kanji seul.
    sortie.icones[t] = png(carre(t <= 32 ? kanji : encre, t, t <= 32 ? 0.02 : 0.06))
  }
  sortie.icones[512] = png(carre(encre, 512, 0.06))
  return sortie
}
`

/** Assemble un fichier .ico à partir de PNG (format accepté depuis Windows Vista). */
function ico(pngs) {
  const entetes = Buffer.alloc(6 + 16 * pngs.length)
  entetes.writeUInt16LE(0, 0)
  entetes.writeUInt16LE(1, 2)
  entetes.writeUInt16LE(pngs.length, 4)
  let offset = entetes.length
  pngs.forEach(({ taille, data }, i) => {
    const o = 6 + i * 16
    entetes.writeUInt8(taille >= 256 ? 0 : taille, o)
    entetes.writeUInt8(taille >= 256 ? 0 : taille, o + 1)
    entetes.writeUInt8(0, o + 2)
    entetes.writeUInt8(0, o + 3)
    entetes.writeUInt16LE(1, o + 4)
    entetes.writeUInt16LE(32, o + 6)
    entetes.writeUInt32LE(data.length, o + 8)
    entetes.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([entetes, ...pngs.map((p) => p.data)])
}

const versBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')

// Dossier de travail à part, pour ne pas entrer en conflit avec une autre app Electron ouverte.
app.setPath('userData', join(app.getPath('temp'), 'kaze-logo'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    const logo = source ? readFileSync(source).toString('base64') : null
    console.log(logo ? `Logo trouvé : ${source}` : 'Pas de assets/logo/kaze-logo.(png|jpg|webp) : icônes provisoires à partir de la police.')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
    win.webContents.on('render-process-gone', (_e, d) => console.error('Page de travail arrêtée :', d.reason))
    win.webContents.on('console-message', (e) => console.log('[page]', e.message))
    await win.loadURL('about:blank')
    const resultat = await win.webContents.executeJavaScript(
      `(${TRAVAIL})(${JSON.stringify(logo)}, ${JSON.stringify(mime)}, ${JSON.stringify(policeKanji())}, ${JSON.stringify(TAILLES)})`
    )

    mkdirSync(join(sortieBuild, 'icons'), { recursive: true })
    const pngs = []
    for (const [taille, url] of Object.entries(resultat.icones)) {
      const data = versBuffer(url)
      writeFileSync(join(sortieBuild, 'icons', `${taille}x${taille}.png`), data)
      if (Number(taille) <= 256) pngs.push({ taille: Number(taille), data })
    }
    writeFileSync(join(sortieBuild, 'icon.ico'), ico(pngs.sort((a, b) => a.taille - b.taille)))
    writeFileSync(join(sortieBuild, 'icon.png'), versBuffer(resultat.icones[512]))

    if (logo) {
      // Les versions pour l'interface ne sont écrites qu'à partir du vrai logo :
      // sans lui, l'interface garde le kanji typographique et l'animation au pinceau.
      mkdirSync(sortieUi, { recursive: true })
      for (const [nom, url] of Object.entries(resultat.ui)) writeFileSync(join(sortieUi, nom), versBuffer(url))
      writeFileSync(join(sortieUi, `logo-complet.${trouve}`), readFileSync(source))
      console.log(`Interface : ${readdirSync(sortieUi).length} fichiers dans src/renderer/src/assets/logo`)
    }
    console.log('Icônes : build/icon.ico, build/icon.png et build/icons/*.png')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
  app.quit()
})

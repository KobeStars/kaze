/**
 * Script injecté dans chaque page (via le protocole DevTools, avant les scripts du site)
 * pour compléter l'identité Chrome : ce que Chrome ajoute à toutes les pages et qu'Electron
 * n'a pas. Google s'en sert pour distinguer un vrai Chrome d'un navigateur intégré.
 *
 *  - window.chrome : Electron laisse un objet vide ; Chrome y met app, csi() et loadTimes(),
 *    et runtime sur les sites Google.
 *  - Notifications : Kaze répond « refusé » par défaut, Chrome « à demander » (default).
 *  - Les fonctions ajoutées se présentent comme du code natif (toString).
 *
 * Écrit en JavaScript simple (pas de TypeScript ici : le texte est envoyé tel quel à la page).
 */
export const CHROME_PAGE_SCRIPT = String.raw`(() => {
  try {
    if (window.chrome && typeof window.chrome.loadTimes === 'function') return;

    // Les fonctions ajoutées affichent « [native code] », comme celles de Chrome.
    const natives = new WeakSet();
    const nativeToString = Function.prototype.toString;
    const toString = new Proxy(nativeToString, {
      apply(target, self, args) {
        if (natives.has(self)) return 'function ' + self.name + '() { [native code] }';
        return Reflect.apply(target, self, args);
      }
    });
    natives.add(toString);
    Object.defineProperty(Function.prototype, 'toString', { value: toString, writable: true, configurable: true, enumerable: false });
    const native = (name, fn) => {
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      natives.add(fn);
      return fn;
    };

    const chrome = window.chrome || {};
    const navEntry = () => performance.getEntriesByType('navigation')[0] || {};
    const paint = () => (performance.getEntriesByType('paint').find((p) => p.name === 'first-paint') || {}).startTime;

    const api = {
      getDetails() { return null; },
      getIsInstalled() { return false; },
      installState(callback) { if (typeof callback === 'function') setTimeout(() => callback('not_installed'), 0); },
      runningState() { return 'cannot_run'; },
      csi() {
        const t = performance.timing;
        return { onloadT: t.domContentLoadedEventEnd, startE: t.navigationStart, pageT: performance.now(), tran: 15 };
      },
      loadTimes() {
        const t = performance.timing;
        const n = navEntry();
        const protocol = n.nextHopProtocol || 'http/1.1';
        const start = t.navigationStart / 1000;
        const firstPaint = paint();
        return {
          requestTime: start,
          startLoadTime: start,
          commitLoadTime: t.responseStart / 1000,
          finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
          finishLoadTime: t.loadEventEnd / 1000,
          firstPaintTime: firstPaint ? (t.navigationStart + firstPaint) / 1000 : 0,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: ['h2', 'h3'].includes(protocol),
          wasNpnNegotiated: ['h2', 'h3'].includes(protocol),
          npnNegotiatedProtocol: protocol,
          wasAlternateProtocolAvailable: false,
          connectionInfo: protocol
        };
      },
      connect() {
        throw new TypeError('Error in invocation of runtime.connect(optional string extensionId, optional object connectInfo): chrome.runtime.connect() called from a webpage must specify an Extension ID (string) for its first argument.');
      },
      sendMessage() {
        throw new TypeError('Error in invocation of runtime.sendMessage(optional string extensionId, any message, optional object options, optional function callback): chrome.runtime.sendMessage() called from a webpage must specify an Extension ID (string) for its first argument.');
      }
    };

    chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: native('getDetails', api.getDetails),
      getIsInstalled: native('getIsInstalled', api.getIsInstalled),
      installState: native('installState', api.installState),
      runningState: native('runningState', api.runningState)
    };
    chrome.csi = native('csi', api.csi);
    chrome.loadTimes = native('loadTimes', api.loadTimes);

    // Sur les sites Google, des composants intégrés de Chrome exposent chrome.runtime.
    if (/(^|\.)(google\.[a-z.]+|youtube\.com)$/.test(location.hostname) && !chrome.runtime) {
      chrome.runtime = {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', FUCHSIA: 'fuchsia', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        connect: native('connect', api.connect),
        sendMessage: native('sendMessage', api.sendMessage)
      };
    }
    if (!window.chrome) Object.defineProperty(window, 'chrome', { value: chrome, writable: true, enumerable: true, configurable: false });

    // Notifications : « à demander » plutôt que « refusé » tant que l'utilisateur n'a rien choisi.
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      const getter = { get permission() { return 'default'; } };
      Object.defineProperty(Notification, 'permission', {
        get: native('get permission', Object.getOwnPropertyDescriptor(getter, 'permission').get),
        configurable: true,
        enumerable: true
      });
      const query = Permissions.prototype.query;
      const patched = {
        query(descriptor) {
          return Reflect.apply(query, this, [descriptor]).then((status) => {
            if (descriptor && descriptor.name === 'notifications' && status.state === 'denied') {
              Object.defineProperty(status, 'state', { value: 'prompt', configurable: true });
            }
            return status;
          });
        }
      };
      Permissions.prototype.query = native('query', patched.query);
    }
  } catch (error) {
    // Ne jamais casser une page à cause de ce complément.
  }
})();`

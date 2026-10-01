// Injected into marked pages by the service worker. Running it again in the same
// page is a no-op, so the API below survives repeated injections.
(() => {
  if (globalThis.__tabMarker) return;

  const ICON_ATTR = 'data-tab-marker-icon';
  const state = {
    color: null,
    prefix: '',
    savedIcons: [],
    iconLink: null,
    titleObserver: null,
    headObserver: null,
    applying: false,
    generation: 0
  };

  // Any of our emoji, not just the current one: after an extension reload a fresh
  // copy of this script finds the previous copy's prefix still in the title.
  const PREFIX_RE = /^(?:🔴|🟠|🟡|🟢|🔵|🟣|🟤|⚫|⚪) /u;

  // After the extension is reloaded or updated this copy keeps running but can no longer
  // talk to the extension. Stop it so it doesn't fight the freshly injected copy.
  function orphaned() {
    if (chrome.runtime?.id) return false;
    state.titleObserver?.disconnect();
    state.headObserver?.disconnect();
    state.color = null;
    return true;
  }

  function stripPrefix(title) {
    return title.replace(PREFIX_RE, '');
  }

  function setTitle() {
    state.applying = true;
    const base = stripPrefix(document.title);
    document.title = state.prefix + base;
    state.applying = false;
  }

  function watchTitle() {
    state.titleObserver?.disconnect();
    // Pages (e.g. Gmail, Slack) rewrite their title constantly; put our marker back each time.
    state.titleObserver = new MutationObserver(() => {
      if (orphaned()) return;
      if (state.applying || !state.color) return;
      if (!document.title.startsWith(state.prefix)) setTitle();
    });
    const target = document.querySelector('head') || document.documentElement;
    state.titleObserver.observe(target, { subtree: true, childList: true, characterData: true });
  }

  function iconLinks() {
    return [...document.querySelectorAll('link[rel~="icon"]')].filter((l) => !l.hasAttribute(ICON_ATTR));
  }

  function originalIconUrl() {
    const links = state.savedIcons.length ? state.savedIcons : iconLinks();
    const link = links.find((l) => l.href);
    return link ? link.href : new URL('/favicon.ico', location.href).href;
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 1500);
      img.crossOrigin = 'anonymous';
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    });
  }

  function drawIcon(color, img) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    if (img) {
      const inner = 38;
      const offset = (size - inner) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, inner / 2 + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, offset, offset, inner, inner);
    }

    try {
      return canvas.toDataURL('image/png');
    } catch {
      // The site's favicon tainted the canvas (no CORS headers); fall back to a plain dot.
      return img ? drawIcon(color, null) : null;
    }
  }

  async function setFavicon(color) {
    const generation = ++state.generation;
    const img = await loadImage(originalIconUrl());
    if (generation !== state.generation || !state.color) return; // superseded

    const dataUrl = drawIcon(color, img);
    if (!dataUrl) return;

    for (const link of iconLinks()) {
      state.savedIcons.push(link);
      link.remove();
    }
    if (!state.iconLink) {
      state.iconLink = document.createElement('link');
      state.iconLink.rel = 'icon';
      state.iconLink.setAttribute(ICON_ATTR, '');
    }
    state.iconLink.href = dataUrl;
    (document.head || document.documentElement).appendChild(state.iconLink);
  }

  function watchIcons() {
    state.headObserver?.disconnect();
    // If the page swaps its favicon later (unread counters etc.), keep ours on top.
    state.headObserver = new MutationObserver(() => {
      if (orphaned()) return;
      if (!state.color) return;
      const added = iconLinks();
      if (!added.length) return;
      for (const link of added) {
        state.savedIcons.push(link);
        link.remove();
      }
    });
    state.headObserver.observe(document.head || document.documentElement, { childList: true });
  }

  globalThis.__tabMarker = {
    apply(color, emoji) {
      // Remove a favicon left behind by a previous copy of this script.
      for (const link of document.querySelectorAll(`link[${ICON_ATTR}]`)) {
        if (link !== state.iconLink) link.remove();
      }
      const base = stripPrefix(document.title);
      state.color = color;
      state.prefix = emoji + ' ';
      state.applying = true;
      document.title = state.prefix + base;
      state.applying = false;
      watchTitle();
      watchIcons();
      setFavicon(color);
    },

    clear() {
      if (!state.color) return;
      state.titleObserver?.disconnect();
      state.headObserver?.disconnect();
      state.generation++;
      document.title = stripPrefix(document.title);
      state.color = null;
      state.prefix = '';
      state.iconLink?.remove();
      const head = document.head || document.documentElement;
      for (const link of state.savedIcons) head.appendChild(link);
      state.savedIcons = [];
    }
  };
})();

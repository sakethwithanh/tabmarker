import { PRESET_COLORS, DEFAULT_COLOR, emojiForColor } from './shared.js';

// How long after the browser starts we keep trying to match restored tabs to old marks.
const RESTORE_WINDOW_MS = 2 * 60 * 1000;

// Marks are kept in local storage as { [tabId]: { color, url, markedAt } } so they
// survive extension reloads. Tab IDs change when the browser restarts, so on startup
// the old marks become "pending" and are matched back to restored tabs by URL.
//
// All read-modify-write access goes through update() so concurrent events
// (many tabs restoring at once) don't overwrite each other.
let queue = Promise.resolve();

function update(fn) {
  const run = queue.then(async () => {
    const { marks = {}, pending = [], pendingUntil = 0 } = await chrome.storage.local.get(['marks', 'pending', 'pendingUntil']);
    const state = { marks, pending: Date.now() < pendingUntil ? pending : [], pendingUntil };
    const result = await fn(state);
    await chrome.storage.local.set(state);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

async function getMarks() {
  const { marks = {} } = await chrome.storage.local.get('marks');
  return marks;
}

async function getLastColor() {
  const { lastColor = DEFAULT_COLOR } = await chrome.storage.local.get('lastColor');
  return lastColor;
}

async function setBadge(tabId, color) {
  try {
    if (color) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
      await chrome.action.setBadgeText({ tabId, text: '★' });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch {
    // Tab already closed.
  }
}

// Recolour favicon + prefix title inside the page. Fails silently on pages
// extensions can't touch (chrome://, edge://, the web stores); the toolbar badge still shows.
async function paintPage(tabId, color) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/mark.js'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (c, e) => (c ? globalThis.__tabMarker.apply(c, e) : globalThis.__tabMarker.clear()),
      args: [color, color ? emojiForColor(color) : '']
    });
  } catch {
    // Restricted, discarded or not-yet-loaded page; onUpdated repaints it once it loads.
  }
}

function show(tabId, color) {
  return Promise.all([setBadge(tabId, color), paintPage(tabId, color)]);
}

function tabUrl(tab) {
  return tab.url || tab.pendingUrl || '';
}

async function markTab(tabId, color) {
  const tab = await chrome.tabs.get(tabId);
  await update(({ marks }) => {
    marks[tabId] = { color, url: tabUrl(tab), markedAt: marks[tabId]?.markedAt ?? Date.now() };
  });
  await chrome.storage.local.set({ lastColor: color });
  await show(tabId, color);
}

async function unmarkTab(tabId) {
  await update(({ marks }) => {
    delete marks[tabId];
  });
  await show(tabId, null);
}

async function toggleTab(tabId) {
  const marks = await getMarks();
  if (marks[tabId]) await unmarkTab(tabId);
  else await markTab(tabId, await getLastColor());
}

// Give an unmarked tab the pending (pre-restart) mark with the same URL, if any.
// Must be called inside update().
function claimIn(state, tab) {
  const url = tabUrl(tab);
  if (!url || state.marks[tab.id]) return null;
  const i = state.pending.findIndex((p) => p.url === url);
  if (i < 0) return null;
  const [mark] = state.pending.splice(i, 1);
  state.marks[tab.id] = mark;
  return mark;
}

// Called when the browser starts (all tab IDs are stale) and when the extension is
// installed, updated or reloaded (tab IDs are usually still valid, but an update can
// also land right at browser startup). A mark is kept only if its tab still exists at
// the same URL; the rest become pending and are matched to tabs by URL, including tabs
// that session restore brings back over the next couple of minutes.
async function rematch({ startup }) {
  const tabs = await chrome.tabs.query({});
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const kept = await update((state) => {
    const stale = [];
    for (const [id, mark] of Object.entries(state.marks)) {
      const tab = byId.get(Number(id));
      if (startup || !tab || tabUrl(tab) !== mark.url) {
        stale.push(mark);
        delete state.marks[id];
      }
    }
    if (stale.length) {
      state.pending = [...state.pending, ...stale];
      state.pendingUntil = Date.now() + RESTORE_WINDOW_MS;
    }
    return { ...state.marks };
  });

  // Repaint kept marks (their old content scripts were orphaned by the reload)...
  await Promise.all(Object.entries(kept).map(([id, m]) => show(Number(id), m.color)));
  // ...and hand pending marks to matching tabs that are already open.
  const claimed = await update((state) => tabs.map((tab) => [tab.id, claimIn(state, tab)]));
  await Promise.all(claimed.filter(([, m]) => m).map(([id, m]) => show(id, m.color)));
}

chrome.runtime.onStartup.addListener(() => rematch({ startup: true }));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;

  // Read inside update() so we see marks claimed by an earlier event for this tab
  // (the "url" and "complete" events of one page load arrive back to back).
  const mark = await update((state) => {
    const m = state.marks[tabId] || claimIn(state, tab);
    // Remember where the tab is now, so a restart can find it again.
    if (m && changeInfo.url) m.url = changeInfo.url;
    return m;
  });
  if (!mark) return;
  if (changeInfo.status === 'complete') await show(tabId, mark.color);
  else await setBadge(tabId, mark.color);
});

chrome.tabs.onRemoved.addListener(async (tabId, { isWindowClosing }) => {
  // Keep marks of tabs closed with their window: that's also what happens when
  // the browser quits, and we want those back after the restart.
  if (isWindowClosing) return;
  await update(({ marks }) => {
    delete marks[tabId];
  });
});

// Prerendered / discarded tabs come back with a new ID.
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const mark = await update(({ marks }) => {
    const m = marks[removedTabId];
    if (!m) return null;
    marks[addedTabId] = m;
    delete marks[removedTabId];
    return m;
  });
  if (mark) await show(addedTabId, mark.color);
});

// Right-click menu on the page and on the toolbar icon.
chrome.runtime.onInstalled.addListener(() => {
  rematch({ startup: false });
  chrome.contextMenus.removeAll(() => {
    const contexts = ['page', 'action'];
    chrome.contextMenus.create({ id: 'root', title: 'Mark tab as important', contexts });
    for (const c of PRESET_COLORS) {
      chrome.contextMenus.create({ id: `color:${c.value}`, parentId: 'root', title: c.name, contexts });
    }
    chrome.contextMenus.create({ id: 'sep', parentId: 'root', type: 'separator', contexts });
    chrome.contextMenus.create({ id: 'unmark', parentId: 'root', title: 'Remove mark', contexts });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || tab.id < 0) return;
  if (info.menuItemId === 'unmark') unmarkTab(tab.id);
  else if (String(info.menuItemId).startsWith('color:')) markTab(tab.id, info.menuItemId.slice(6));
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-mark') return;
  const target = tab?.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id) await toggleTab(target.id);
});

// Messages from the popup. Work happens here so it finishes even if the popup closes.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'mark':
        await markTab(msg.tabId, msg.color);
        break;
      case 'unmark':
        await unmarkTab(msg.tabId);
        break;
    }
    sendResponse({ marks: await getMarks() });
  })();
  return true;
});

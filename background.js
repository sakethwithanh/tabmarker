import { PRESET_COLORS, DEFAULT_COLOR, emojiForColor } from './shared.js';

// Marks live in session storage: tab IDs are only valid until the browser closes.
async function getMarks() {
  const { marks = {} } = await chrome.storage.session.get('marks');
  return marks;
}

async function saveMarks(marks) {
  await chrome.storage.session.set({ marks });
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
    // Restricted page.
  }
}

async function markTab(tabId, color) {
  const marks = await getMarks();
  marks[tabId] = { color, markedAt: Date.now() };
  await saveMarks(marks);
  await chrome.storage.local.set({ lastColor: color });
  await Promise.all([setBadge(tabId, color), paintPage(tabId, color)]);
}

async function unmarkTab(tabId) {
  const marks = await getMarks();
  delete marks[tabId];
  await saveMarks(marks);
  await Promise.all([setBadge(tabId, null), paintPage(tabId, null)]);
}

async function toggleTab(tabId) {
  const marks = await getMarks();
  if (marks[tabId]) await unmarkTab(tabId);
  else await markTab(tabId, await getLastColor());
}

// Keep marks across navigations/reloads in the same tab.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const mark = (await getMarks())[tabId];
  if (!mark) return;
  await Promise.all([setBadge(tabId, mark.color), paintPage(tabId, mark.color)]);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const marks = await getMarks();
  if (!marks[tabId]) return;
  delete marks[tabId];
  await saveMarks(marks);
});

// Prerendered / discarded tabs come back with a new ID.
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const marks = await getMarks();
  if (!marks[removedTabId]) return;
  marks[addedTabId] = marks[removedTabId];
  delete marks[removedTabId];
  await saveMarks(marks);
  await Promise.all([setBadge(addedTabId, marks[addedTabId].color), paintPage(addedTabId, marks[addedTabId].color)]);
});

// Right-click menu on the page and on the toolbar icon.
chrome.runtime.onInstalled.addListener(() => {
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

import { PRESET_COLORS, emojiForColor } from '../shared.js';

const MAX_RECENT = 8;

const $ = (id) => document.getElementById(id);
let currentTab;
let marks = {};

async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  marks = res.marks;
  await render();
}

async function rememberCustom(color) {
  const { recentColors = [] } = await chrome.storage.local.get('recentColors');
  const isPreset = PRESET_COLORS.some((c) => c.value === color);
  if (isPreset) return;
  const next = [color, ...recentColors.filter((c) => c !== color)].slice(0, MAX_RECENT);
  await chrome.storage.local.set({ recentColors: next });
}

function mark(color) {
  return send({ type: 'mark', tabId: currentTab.id, color });
}

function makeSwatch(color, title) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = color;
  b.title = title;
  b.dataset.color = color;
  b.addEventListener('click', () => mark(color));
  return b;
}

async function render() {
  const mine = marks[currentTab.id];

  $('status').textContent = mine ? `Marked ${emojiForColor(mine.color)}` : 'This tab is not marked';
  $('current-title').textContent = currentTab.title || currentTab.url || '';
  const dot = $('current-dot');
  dot.classList.toggle('on', !!mine);
  dot.style.background = mine ? mine.color : '';
  $('unmark').hidden = !mine;

  const { recentColors = [] } = await chrome.storage.local.get('recentColors');
  $('recent').replaceChildren(...recentColors.map((c) => makeSwatch(c, c)));

  for (const s of document.querySelectorAll('.swatch')) {
    s.classList.toggle('selected', !!mine && s.dataset.color === mine.color);
  }

  await renderList();
}

async function renderList() {
  const ids = Object.keys(marks).map(Number);
  $('marked-section').hidden = ids.length === 0;
  if (!ids.length) return;

  const tabs = (await chrome.tabs.query({})).filter((t) => marks[t.id]);
  tabs.sort((a, b) => marks[a.id].markedAt - marks[b.id].markedAt);

  $('marked-list').replaceChildren(
    ...tabs.map((t) => {
      const li = document.createElement('li');
      li.title = t.url || '';

      const dot = document.createElement('span');
      dot.className = 'dot on';
      dot.style.background = marks[t.id].color;

      const name = document.createElement('span');
      name.className = 'name';
      // Drop our own emoji prefix; the dot already shows the colour.
      name.textContent = (t.title || t.url).replace(/^\p{Emoji_Presentation} /u, '');

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = 'Remove mark';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        send({ type: 'unmark', tabId: t.id });
      });

      li.addEventListener('click', async () => {
        await chrome.tabs.update(t.id, { active: true });
        await chrome.windows.update(t.windowId, { focused: true });
        window.close();
      });

      li.append(dot, name, remove);
      return li;
    })
  );
}

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  $('presets').replaceChildren(...PRESET_COLORS.map((c) => makeSwatch(c.value, c.name)));

  const { lastColor } = await chrome.storage.local.get('lastColor');
  if (lastColor) $('custom-color').value = lastColor;

  $('apply-custom').addEventListener('click', async () => {
    const color = $('custom-color').value;
    await rememberCustom(color);
    await mark(color);
  });
  $('unmark').addEventListener('click', () => send({ type: 'unmark', tabId: currentTab.id }));

  await send({ type: 'get' });
}

init();

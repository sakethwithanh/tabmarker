# Tab Marker

A Chrome / Microsoft Edge extension that marks tabs as important in any colour you choose.

When a tab is marked:

- Its **favicon** is redrawn inside a ring of your colour (any colour, including custom ones).
- A matching **coloured emoji** (🔴🟠🟡🟢🔵🟣🟤⚫⚪) is added in front of the tab title, so you can spot it even when tabs are narrow.
- The toolbar icon shows a **★ badge** in that colour while the tab is active.

Marks stay when you reload or navigate in the same tab, and they come back after you restart the browser if it reopens your tabs ("Continue where you left off"). Closing a tab removes its mark.

## Install (unpacked)

1. Download or clone this repository.
2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Pin **Tab Marker** to the toolbar so it's easy to reach.

## Usage

- **Popup:** click the toolbar icon, then pick a preset colour or choose a custom colour and click **Mark**. The popup also lists every marked tab: click one to switch to it, or click **×** to remove its mark.
- **Right-click menu:** right-click on a page (or on the toolbar icon) and choose **Mark tab as important → colour**, or **Remove mark**.
- **Keyboard:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> toggles the mark on the current tab using the last colour you used. You can change the shortcut at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`).

## Limitations

- Browsers don't let extensions change the actual colour of a tab, so this extension recolours the favicon and the title instead.
- Browser pages (`chrome://`, `edge://`, the Chrome Web Store, Edge Add-ons) can't be modified by extensions. On those pages you can still mark the tab: it keeps its mark and toolbar badge and shows up in the popup list, but its favicon and title don't change.
- After a restart, marks are matched to reopened tabs by web address for about two minutes. If several restored tabs share an address, the marks go to them in order.
- If a site's favicon can't be read (because of cross-origin restrictions), the marked favicon is a plain dot in your colour.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `background.js` | Service worker: stores marks, context menu, keyboard shortcut, re-applies marks after reload |
| `content/mark.js` | Injected into pages to recolour the favicon and prefix the title |
| `popup/` | Toolbar popup UI |
| `shared.js` | Preset colours and colour-to-emoji helper |
| `icons/` | Extension icons |

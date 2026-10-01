// Shared between the service worker and the popup.

export const PRESET_COLORS = [
  { name: 'Red', value: '#e53935' },
  { name: 'Orange', value: '#fb8c00' },
  { name: 'Yellow', value: '#fdd835' },
  { name: 'Green', value: '#43a047' },
  { name: 'Blue', value: '#1e88e5' },
  { name: 'Purple', value: '#8e24aa' },
  { name: 'Pink', value: '#d81b60' },
  { name: 'Black', value: '#212121' }
];

export const DEFAULT_COLOR = PRESET_COLORS[0].value;

// Emoji shown in front of the tab title. Picks the one closest to the chosen colour.
const EMOJI = [
  { emoji: '🔴', rgb: [229, 57, 53] },
  { emoji: '🟠', rgb: [251, 140, 0] },
  { emoji: '🟡', rgb: [253, 216, 53] },
  { emoji: '🟢', rgb: [67, 160, 71] },
  { emoji: '🔵', rgb: [30, 136, 229] },
  { emoji: '🟣', rgb: [142, 36, 170] },
  { emoji: '🟤', rgb: [121, 85, 72] },
  { emoji: '⚫', rgb: [33, 33, 33] },
  { emoji: '⚪', rgb: [240, 240, 240] }
];

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function emojiForColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  let best = EMOJI[0];
  let bestDist = Infinity;
  for (const e of EMOJI) {
    const d = (e.rgb[0] - r) ** 2 + (e.rgb[1] - g) ** 2 + (e.rgb[2] - b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best.emoji;
}

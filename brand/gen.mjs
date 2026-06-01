import sharp from '/tmp/node_modules/sharp/lib/index.js';
import { writeFileSync } from 'node:fs';

// Brand anchor glyph (viewBox 0 0 100 100) — exact match to the app header mark
const anchor = (stroke) => `
  <circle cx="50" cy="20" r="9"/>
  <line x1="50" y1="29" x2="50" y2="82"/>
  <line x1="33" y1="40" x2="67" y2="40"/>
  <path d="M22 60 C 22 78 38 86 50 86 C 62 86 78 78 78 60"/>
  <path d="M22 60 L 13 52"/>
  <path d="M78 60 L 87 52"/>`;

const GOLD = '#c9a558', GOLD_DEEP = '#b58f4a', NAVY = '#020617', WHITE = '#f1f5f9', NAVY_TEXT = '#0b1220';

// ---- Icon (square 512) ----
const iconDark = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${NAVY}"/>
  <rect x="8" y="8" width="496" height="496" rx="104" fill="none" stroke="${GOLD_DEEP}" stroke-opacity="0.30" stroke-width="4"/>
  <g transform="translate(126,112) scale(2.6)" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${anchor()}</g>
</svg>`;

const iconTransparent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <g transform="translate(126,112) scale(2.6)" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${anchor()}</g>
</svg>`;

// ---- Wordmark (horizontal ~960x280) ----
const wordmark = (textFill, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="280" viewBox="0 0 1000 280">
  ${bg ? `<rect width="1000" height="280" rx="0" fill="${bg}"/>` : ''}
  <g transform="translate(44,46) scale(1.92)" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${anchor()}</g>
  <text x="300" y="190" font-family="Helvetica, Arial, sans-serif" font-size="158" font-weight="800" letter-spacing="-7" fill="${textFill}">Anchor</text>
</svg>`;

const assets = [
  ['anchor-icon-dark.png',          iconDark,                         512, 512],
  ['anchor-icon-transparent.png',   iconTransparent,                  512, 512],
  ['anchor-wordmark-light.png',     wordmark(NAVY_TEXT, null),       1000, 280], // dark text, transparent — for Stripe (light bg)
  ['anchor-wordmark-dark.png',      wordmark(WHITE, null),           1000, 280], // white text, transparent — for dark bg
  ['anchor-wordmark-banner.png',    wordmark(WHITE, NAVY),           1000, 280], // white text on navy banner
];

for (const [file, svg, w, h] of assets) {
  writeFileSync(file.replace('.png', '.svg'), svg);
  await sharp(Buffer.from(svg)).resize(w, h).png().toFile(file);
  console.log('wrote', file);
}
console.log('done');

import { continueRender, delayRender, staticFile } from 'remotion';

const anton = new FontFace(
  'Anton',
  `url('${staticFile('fonts/anton-latin.woff2')}') format('woff2')`,
);
const inter = new FontFace(
  'Inter',
  `url('${staticFile('fonts/inter-latin.woff2')}') format('woff2')`,
  { weight: '100 900' },
);

const handle = delayRender('Loading fonts');
Promise.all([anton.load(), inter.load()])
  .then((loaded) => {
    loaded.forEach((f) => document.fonts.add(f));
    continueRender(handle);
  })
  .catch((err) => {
    console.error('Font load failed', err);
    continueRender(handle);
  });

export const ANTON = 'Anton, sans-serif';
export const INTER = 'Inter, system-ui, -apple-system, sans-serif';

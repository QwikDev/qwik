import { assert, test } from 'vitest';
import { optimizeSvg } from './image-jsx';

const qwikLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 649 201"><path fill="#18B6F6" d="m153.3 186.54-29.35-29.2-.42.07v-.3L61.12 95.37l15.41-14.85-9.06-51.93-42.89 53.2c-7.28 7.36-8.68 19.39-3.4 28.21l26.8 44.49c4.1 6.82 10.54 11.2 19.53 10.88 19.03-.67 27.4-.67 27.4-.67l58.37 21.81.02.02Z"/><path fill="#AC7EF4" d="M167.8 104.72c4.23-8.72 5.74-16.35 1.57-24l-5.93-10.92-3.08-5.6-1.2-2.2-.1.14-16.15-28A22.57 22.57 0 0 0 123.1 22.8l-14.16.4-42.25.11A22.66 22.66 0 0 0 47.31 34.5L21.64 85.48l45.94-57.15 60.27 66.27-10.8 10.93 6.45 51.84.09-.1v.14h-.1l.14.13 5.02 4.9 24.3 23.74c1.03.98 2.68-.2 2-1.42l-15.02-29.57"/><path fill="#fff" d="M127.99 94.43 67.56 28.5l8.59 51.64-15.38 14.92 62.62 62.23-5.64-51.66 10.24-11.17v-.02Z"/><path fill="#000" stroke="#fff" stroke-linejoin="round" stroke-width="3" d="M319.08 188.1c.83 0 1.5-.68 1.5-1.5V61.78a1.5 1.5 0 0 0-1.03-1.43c-12.58-4.07-26.24-6.1-41.15-6.1-15.89 0-27.69 3.7-35.21 11.61l-.01.02c-7.34 7.9-10.8 21.53-10.8 39.7 0 18.12 2.9 31.18 9.08 38.73 6.24 7.58 16.04 11.12 28.9 11.12a45.6 45.6 0 0 0 24.04-6.58v37.75c0 .82.68 1.5 1.5 1.5h23.18Zm-24.7-110.05V124c0 1.83-1.37 3.8-4.4 5.4-2.97 1.57-7.24 2.59-12.16 2.59-7.63 0-12.35-1.95-15.04-5.44-1.36-1.75-2.43-4.37-3.16-8.01-.73-3.63-1.09-8.18-1.09-13.7 0-5.86.41-10.72 1.19-14.61.77-3.9 1.9-6.73 3.27-8.58 2.68-3.62 7.73-5.58 15.4-5.58 5.83 0 11.16.62 16 1.98Zm57.89-21.23h-23.52a1.5 1.5 0 0 0-1.4 2.02c10.56 28.23 20.4 59.2 29.52 93.1a1.5 1.5 0 0 0 1.44 1.1h27.18c.64 0 1.2-.4 1.42-1a553.09 553.09 0 0 0 16.4-54.94c5.8 21.37 10.17 39.52 13 54.72a1.5 1.5 0 0 0 1.48 1.23h27.18a1.5 1.5 0 0 0 1.39-.94 1032.42 1032.42 0 0 0 32.34-93.37 1.5 1.5 0 0 0-1.44-1.92h-22.8a1.5 1.5 0 0 0-1.46 1.13c-4.94 19.41-11.47 40.57-19.74 63.65a683.17 683.17 0 0 0-18.07-63.76 1.5 1.5 0 0 0-1.42-1.02H393.5c-.69 0-1.3.47-1.45 1.15a745.57 745.57 0 0 1-18.45 63.76 795.63 795.63 0 0 0-19.84-63.7 1.5 1.5 0 0 0-1.48-1.21h-.02ZM490 58.34v93.23c0 .83.68 1.5 1.5 1.5h23.18c.83 0 1.5-.67 1.5-1.5V58.34c0-.83-.67-1.5-1.5-1.5h-22.93a1.5 1.5 0 0 0-1.74 1.48v.02Zm-1.63-25.93c0 5.22.7 9.05 3.2 11.46 2.48 2.4 6.33 3 11.44 3 5.1 0 8.96-.6 11.44-3 2.5-2.41 3.2-6.24 3.2-11.46 0-4.7-.71-8.2-3.27-10.39-2.47-2.1-6.3-2.62-11.37-2.62-5.08 0-8.9.52-11.37 2.62-2.56 2.18-3.27 5.69-3.27 10.39Zm135.61 24.41h-26.81c-.5 0-.95.24-1.23.64a669.19 669.19 0 0 1-21.85 29.9c-4.19 5.32-7.48 9.12-9.91 11.48V18c0-.83-.67-1.5-1.5-1.5H539.5c-.83 0-1.5.67-1.5 1.5v133.57c0 .83.67 1.5 1.5 1.5h23.18c.83 0 1.5-.67 1.5-1.5V104.9c.67.57 1.44 1.3 2.32 2.24 1.97 2.1 4.4 5.06 7.36 9.03 5.92 7.92 13.93 19.7 24.78 36.21.28.42.75.68 1.26.68h26.64a1.5 1.5 0 0 0 1.28-2.28c-8.77-14.54-16.69-26.35-23.08-34.98-3.2-4.3-6.03-7.83-8.4-10.5a47.47 47.47 0 0 0-4.28-4.35c3.17-2.84 7.23-7.37 12.18-13.51a566.95 566.95 0 0 0 20.85-28.1 1.5 1.5 0 0 0-1.09-2.53h-.02Z"/></svg>`;

test('optimize svg', () => {
  const { data, svgAttributes } = optimizeSvg({ code: qwikLogoSvg, path: '' });
  const html = svgAttributes.dangerouslySetInnerHTML;

  assert.isTrue(data.startsWith('<g>') && data.endsWith('</g>'));
  assert.isDefined(html);
  assert.isTrue(html.startsWith('<path') && html.endsWith('/>'));
});

const svgsFilesWithDefsTag = [
  {
    content: `<svg height="130" width="500">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
    </linearGradient>
  </defs>
  <ellipse cx="100" cy="70" rx="85" ry="55" fill="url(#grad1)" />
  <text fill="#ffffff" font-size="45" x="50" y="86">SVG</text>
</svg>`,
    path: '/path/to/svg/svg_1.svg',
  },
  {
    content: `<svg height="130" width="500">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgb(120,0,120);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgb(120,200,0);stop-opacity:1" />
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="70" rx="85" ry="55" fill="url(#grad1)" />
    <text fill="#ffffff" font-size="45" x="50" y="86">SVG</text>
  </svg>`,
    path: '/path/to/svg/svg_2.svg',
  },
];

test('optimize svgs by path', () => {
  const defaultOptimizedSvgs = svgsFilesWithDefsTag.map((file) =>
    optimizeSvg({ code: file.content, path: file.path })
  );

  // ids should have different names, because prefixIds plugin is enabled by default
  assert.isFalse(
    defaultOptimizedSvgs.some((svg) => svg.data.startsWith('<g><defs><linearGradient id="a"'))
  );
});

test('prefixIds plugin should be disableable', () => {
  const defaultOptimizedSvgs = svgsFilesWithDefsTag.map((file) =>
    optimizeSvg(
      { code: file.content, path: file.path },
      { imageOptimization: { svgo: { prefixIds: false } } }
    )
  );

  // all ids be optimized to "a" because prefixIds plugin is disabled
  assert.isTrue(
    defaultOptimizedSvgs.every((svg) => svg.data.startsWith('<g><defs><linearGradient id="a"'))
  );
});

import tomorrowSubset600 from './media/fonts/tomorrow/tomorrow-subset-600-normal.woff2?inline';
import tomorrowLatin600Url from './media/fonts/tomorrow/tomorrow-latin-600-normal.woff2?url';
import ubuntuSansSubset600 from './media/fonts/ubuntu-sans/ubuntu-sans-subset-600-normal.woff2?inline';
import ubuntuSansLatin600Url from './media/fonts/ubuntu-sans/ubuntu-sans-latin-600-normal.woff2?url';
import ubuntuSansSubset700 from './media/fonts/ubuntu-sans/ubuntu-sans-subset-700-normal.woff2?inline';
import ubuntuSansLatin700Url from './media/fonts/ubuntu-sans/ubuntu-sans-latin-700-normal.woff2?url';

const subsetUnicodeRange =
  'U+0020-007E, U+00A0, U+00A9, U+00AD-00AE, U+00B7, U+00E0-00E1, U+00EF, U+00FC, U+2013-2014, U+2018-2019, U+201C-201D, U+2022, U+2026, U+2039-203A, U+2122';
const restOfLatinUnicodeRange =
  'U+00A1-00A8, U+00AA-00AC, U+00AF-00B6, U+00B8-00DF, U+00E2-00EE, U+00F0-00FB, U+00FD-00FF, U+0131, U+0152-0153, U+02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2009, U+201A, U+201E, U+2032-2033, U+2044, U+20AC, U+2212, U+2215';

const webFonts = [
  {
    family: 'Tomorrow',
    weight: 600,
    subsetDataUrl: tomorrowSubset600,
    latinUrl: tomorrowLatin600Url,
  },
  {
    family: 'Ubuntu Sans',
    weight: 600,
    subsetDataUrl: ubuntuSansSubset600,
    latinUrl: ubuntuSansLatin600Url,
  },
  {
    family: 'Ubuntu Sans',
    weight: 700,
    subsetDataUrl: ubuntuSansSubset700,
    latinUrl: ubuntuSansLatin700Url,
  },
];

const createFontFace = (
  family: string,
  weight: number,
  src: string,
  display: 'block' | 'swap',
  unicodeRange?: string
) =>
  `@font-face{font-family:'${family}';src:url(${src}) format('woff2');font-weight:${weight};font-style:normal;font-display:${display}${unicodeRange ? `;unicode-range:${unicodeRange}` : ''}}`;

export const inlinedFontFaces = webFonts
  .map(
    ({ family, weight, subsetDataUrl, latinUrl }) =>
      createFontFace(
        family,
        weight,
        subsetDataUrl,
        'block',
        subsetUnicodeRange
      ) +
      createFontFace(family, weight, latinUrl, 'swap', restOfLatinUnicodeRange)
  )
  .join('');

export const linkedFontFaces = webFonts
  .map(({ family, weight, latinUrl }) =>
    createFontFace(family, weight, latinUrl, 'block')
  )
  .join('');

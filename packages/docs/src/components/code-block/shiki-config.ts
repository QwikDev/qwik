import css from '@shikijs/langs/css';
import html from '@shikijs/langs/html';
import javascript from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import jsx from '@shikijs/langs/jsx';
import tsx from '@shikijs/langs/tsx';
import darkPlus from '@shikijs/themes/dark-plus';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export const SHIKI_THEME = 'dark-plus';

const shikiLangs = ['html', 'css', 'javascript', 'json', 'jsx', 'tsx'] as const;
export type ShikiLangs = (typeof shikiLangs)[number];

export const shikiInstance = await createHighlighterCore({
  themes: [darkPlus],
  langs: [html, css, javascript, json, jsx, tsx],
  engine: createJavaScriptRegexEngine(),
});

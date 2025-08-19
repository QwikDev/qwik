import { createHighlighter } from 'shiki/bundle/web';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export const SHIKI_THEME = 'dark-plus';

const shikiLangs = ['html', 'css', 'javascript', 'json', 'jsx', 'tsx'] as const;
export type ShikiLangs = (typeof shikiLangs)[number];

const jsEngine = createJavaScriptRegexEngine();
export const shikiInstance = await createHighlighter({
  themes: [SHIKI_THEME],
  langs: [...shikiLangs],
  engine: jsEngine,
});

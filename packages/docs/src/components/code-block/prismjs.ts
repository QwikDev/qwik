import prismjs from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-tsx';

const escapeHtml = (code: string) =>
  code
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const highlight = (code?: string, language?: string) => {
  if (!code) {
    return '';
  }

  if (!language || !prismjs.languages[language]) {
    return escapeHtml(code);
  }

  return prismjs.highlight(code, prismjs.languages[language], language);
};

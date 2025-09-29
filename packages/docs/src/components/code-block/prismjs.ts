import prismjs from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-tsx';

export const highlight = (code?: string, language?: string) => {
  if (!code || !language || !prismjs.languages[language]) {
    return `<code class="language-${language}"><pre>${code}</pre></code>`;
  }
  return prismjs.highlight(code, prismjs.languages[language], language);
};

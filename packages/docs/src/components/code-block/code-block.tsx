import { component$ } from '@builder.io/qwik';
import prismjs from 'prismjs';
// Set to global so that prism language plugins can find it.
(global as any).PRISM = prismjs;
import 'prismjs/components/prism-jsx'; // needs PRISM global
import 'prismjs/components/prism-tsx'; // needs PRISM global

interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json' | 'jsx' | 'tsx';
  code: string;
}

export const CodeBlock = component$((props: CodeBlockProps) => {
  let language = props.language;
  if (!language && props.path && props.code) {
    const ext = props.path.split('.').pop();
    language =
      ext === 'js' || ext === 'json'
        ? 'javascript'
        : ext === 'html'
        ? 'markup'
        : ext === 'css'
        ? 'css'
        : undefined;
  }

  if (language && prismjs.languages[language]) {
    const highlighted = prismjs.highlight(props.code, prismjs.languages[language], language);
    const className = `language-${language}`;
    return (
      <pre class={className}>
        <code class={className} dangerouslySetInnerHTML={highlighted} />
      </pre>
    );
  }
  return null;
});

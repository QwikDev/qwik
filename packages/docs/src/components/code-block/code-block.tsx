import { component$ } from '@builder.io/qwik';
import prismjs from 'prismjs';
// Set to global so that prism language plugins can find it.
const _global =
  (typeof globalThis !== 'undefined' && globalThis) ||
  (typeof global !== 'undefined' && global) ||
  (typeof self !== 'undefined' && self) ||
  (typeof this !== 'undefined' && this) ||
  (typeof window !== 'undefined' && window);
(_global as any).PRISM = prismjs;
import 'prismjs/components/prism-jsx'; // needs PRISM global
import 'prismjs/components/prism-tsx'; // needs PRISM global

interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json' | 'jsx' | 'tsx';
  code: string;
  highlightLines?: number[];
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
      <div class="relative code-block">
        {props.highlightLines?.map((line) => (
          <div
            class="absolute left-0 right-0 bg-yellow-100 pointer-events-none opacity-10 highlight"
            style={{ top: `calc(var(--code-line-height) * ${line})`, height: 'var(--code-line-height)', marginTop: '-4px' }}
          />
        ))}
        <pre class={className}>
          <code class={className} dangerouslySetInnerHTML={highlighted} />
        </pre>
      </div>
    );
  }
  return null;
});

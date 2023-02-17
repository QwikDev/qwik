import { component$ } from '@builder.io/qwik';
import { highlight, languages } from 'prismjs';

interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json';
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

  if (language && languages[language]) {
    const highlighted = highlight(props.code, languages[language], language);
    const className = `language-${language}`;
    return (
      <pre class={className}>
        <code class={className} dangerouslySetInnerHTML={highlighted} />
      </pre>
    );
  }
  return null;
});

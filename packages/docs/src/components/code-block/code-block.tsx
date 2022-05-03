import { component$, Host, useStyles$ } from '@builder.io/qwik';
import { highlight, languages } from 'prismjs';
import styles from './code-block.css?inline';

interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json';
  theme?: 'light' | 'dark';
  code: string;
}

export const CodeBlock = component$(
  (props: CodeBlockProps) => {
    useStyles$(styles);

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
      const className = `language-${language}${props.theme ? ' theme-' + props.theme : ''}`;
      return (
        <Host class={className}>
          <code class={className} dangerouslySetInnerHTML={highlighted} />
        </Host>
      );
    }
    return null;
  },
  { tagName: 'pre' }
);

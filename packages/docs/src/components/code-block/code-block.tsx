import { component$, useStyles$, type QRL, useVisibleTask$, useSignal } from '@builder.io/qwik';
import prismjs from 'prismjs'; // provides the Prism global
import 'prismjs/components/prism-jsx'; // needs Prism global
import 'prismjs/components/prism-tsx'; // needs Prism global

import styles from './code-block.css?inline';
import { CopyCode } from '../copy-code/copy-code-block';
interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json' | 'jsx' | 'tsx';
  code: string;
  pathInView$?: QRL<(name: string) => void>;
  observerRootId?: string;
}

export const CodeBlock = component$((props: CodeBlockProps) => {
  const listSig = useSignal<Element>();
  useStyles$(styles);

  useVisibleTask$(async () => {
    const { pathInView$, path, observerRootId } = props;
    if (pathInView$ && path && listSig.value !== undefined) {
      const el = listSig.value;
      const intersectionObserver = new IntersectionObserver(
        ([{ isIntersecting }]) => isIntersecting && pathInView$(path),
        {
          //to avoid any edge case
          root: observerRootId ? document.getElementById(observerRootId) : null,
        }
      );
      intersectionObserver.observe(el);
      return () => {
        intersectionObserver.unobserve(el);
      };
    }
  });

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
      <div class="relative">
        <pre class={className} ref={listSig}>
          <code class={className} dangerouslySetInnerHTML={highlighted} />
        </pre>
        <CopyCode code={props.code} />
      </div>
    );
  }
  return null;
});

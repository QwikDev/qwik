import {
  component$,
  useStyles$,
  type QRL,
  useVisibleTask$,
  useSignal,
  useTask$,
} from '@builder.io/qwik';

import styles from './code-block.css?inline';
import { CopyCode } from '../copy-code/copy-code-block';
interface CodeBlockProps {
  path?: string;
  language?: 'markup' | 'css' | 'javascript' | 'json' | 'jsx' | 'tsx';
  code: string;
  pathInView$?: QRL<(name: string) => void>;
  observerRootId?: string;
}

const holder: { prismjs?: typeof import('prismjs') } = {};

export const CodeBlock = component$((props: CodeBlockProps) => {
  const listSig = useSignal<Element>();
  useStyles$(styles);

  useTask$(() => {
    if (!holder.prismjs) {
      return import('prismjs').then(async (prism) => {
        holder.prismjs = prism;

        // These need the Prism global that prismjs provides
        // We lazy import so we're sure about the order of the imports
        await Promise.all([
          import('prismjs/components/prism-jsx.js' as any),
          import('prismjs/components/prism-tsx.js' as any),
        ]);
      });
    }
  });

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

  if (language && holder.prismjs?.languages[language]) {
    const highlighted = holder.prismjs.highlight(
      props.code,
      holder.prismjs.languages[language],
      language
    );
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

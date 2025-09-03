import { component$, useSignal, useStyles$, useVisibleTask$, type QRL } from '@qwik.dev/core';
import { CopyCode } from '../copy-code/copy-code-block';
import styles from './code-block.css?inline';
import { shikiInstance, SHIKI_THEME, type ShikiLangs } from './shiki-config';

interface CodeBlockProps {
  path?: string;
  language?: ShikiLangs;
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
    language = ext === 'js' || ext === 'json' ? 'javascript' : ext === 'css' ? 'css' : 'html';
  }

  const highlighted = shikiInstance.codeToHtml(props.code, {
    lang: language!,
    theme: SHIKI_THEME,
  });
  const className = `language-${language}`;
  return (
    <div class="relative">
      <pre class={className} ref={listSig}>
        <code class={className} dangerouslySetInnerHTML={highlighted} />
      </pre>
      <CopyCode code={props.code} />
    </div>
  );
});

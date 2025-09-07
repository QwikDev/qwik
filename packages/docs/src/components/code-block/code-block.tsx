import {
  component$,
  useSignal,
  useStyles$,
  useTask$,
  useVisibleTask$,
  type QRL,
  type Signal,
} from '@builder.io/qwik';
import { CopyCode } from '../copy-code/copy-code-block';
import styles from './code-block.css?inline';
import { shikiInstance, SHIKI_THEME, type ShikiLangs } from './shiki-config';
import { format } from 'prettier/standalone';
import parserHtml from 'prettier/plugins/html';
import parserTs from 'prettier/plugins/typescript';
import parserEstree from 'prettier/plugins/estree';

interface CodeBlockProps {
  path?: string;
  language?: ShikiLangs;
  code: string;
  format?: boolean;
  pathInView$?: QRL<(name: string) => void>;
  observerRootId?: string;
}

export const CodeBlock = component$((props: CodeBlockProps) => {
  const listSig = useSignal<Element>();
  const codeSig = useSignal<string | null>(props.format ? null : props.code);
  const formatSig = useSignal(!!props.format);
  const formatError = useSignal<string>();

  const language =
    props.language ||
    (props.path
      ? /\.([cm]?[jt]sx?|json)$/.test(props.path)
        ? 'javascript'
        : props.path.endsWith('.html')
          ? 'html'
          : null
      : null);

  useStyles$(styles);

  useTask$(async ({ track }) => {
    track(() => props.code);
    track(formatSig);

    if (formatSig.value) {
      try {
        // simple formatting for html and js
        if (language === 'html') {
          codeSig.value = await format(props.code, {
            parser: 'html',
            plugins: [parserHtml],
            htmlWhitespaceSensitivity: 'ignore',
          });
        } else if (language === 'javascript') {
          codeSig.value = await format(props.code, {
            parser: 'typescript',
            plugins: [parserTs, parserEstree],
          });
        }
        formatError.value = undefined;
      } catch (e: any) {
        formatError.value = e.message;
        codeSig.value = props.code;
      }
    } else {
      codeSig.value = props.code;
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

  const highlighted =
    codeSig.value != null &&
    shikiInstance.codeToHtml(codeSig.value, {
      lang: language!,
      theme: SHIKI_THEME,
    });
  const className = `language-${language}`;
  return (
    <div class="relative">
      <pre class={className} ref={listSig}>
        {highlighted && <code class={className} dangerouslySetInnerHTML={highlighted} />}
      </pre>
      {(language === 'html' || language === 'javascript') && (
        <PrettierToggle bind:value={formatSig} />
      )}
      <CopyCode code={props.code} />
    </div>
  );
});

const PrettierToggle = component$((props: { 'bind:value': Signal<boolean>; error?: string }) => {
  return (
    <label
      class="prettier-toggle"
      title={`Toggle Prettier ${props.error ? `\n${props.error}` : ''}`}
      aria-label="Toggle Prettier"
    >
      <input type="checkbox" bind:checked={props['bind:value']} style="display: none;" />
      <span class={[props['bind:value'].value ? 'checked' : '', props.error ? 'error' : '']}>
        P
      </span>
    </label>
  );
});

import { $, component$, useSignal, useVisibleTask$, useStyles$ } from '@qwik.dev/core';
import { _getDomContainer, _vnode_toString } from '@qwik.dev/core/internal';
import { getHighlighter } from '../../utils/shiki';

export const HtmlParser = component$(() => {
  useStyles$(`
    pre.shiki { overflow: auto; padding: 10px; height: 100%; }
  `);
  const inputHtml = useSignal('');
  const parsingTime = useSignal<number | null>(null);
  const htmlResult = useSignal<string>('');
  const highlightedHtml = useSignal<string>('');

  const onParseHtml$ = $(() => {
    if (!inputHtml.value.trim()) {
      parsingTime.value = null;
      htmlResult.value = '// Paste HTML on the left to parse';
      return;
    }

    const startTime = performance.now();

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(inputHtml.value, 'text/html');
      let output = '';
      try {
        const container = _getDomContainer(doc.documentElement);
        if (container) {
          output += '// Qwik Container Found:\n';
          output += `- Container Type: ${container.qContainer}\n`;
          output += `- Manifest Hash: ${container.qManifestHash}\n\n`;
          try {
            const vdomTree = _vnode_toString.call(
              container!.rootVNode as any,
              Number.MAX_SAFE_INTEGER,
              '',
              true,
              false,
              false
            );
            output += '// VNode Tree:\n' + vdomTree + '\n\n';
          } catch (vnodeErr) {
            output += '// VNode parsing error: ' + vnodeErr + '\n\n';
          }
        } else {
          output = '// No Qwik container found in the HTML';
        }
      } catch (containerErr) {
        output = '// No Qwik container found or error: ' + containerErr;
      }
      parsingTime.value = performance.now() - startTime;
      htmlResult.value = output;
      return;
    } catch (error) {
      parsingTime.value = performance.now() - startTime;
      htmlResult.value = `// Error parsing HTML: ${error instanceof Error ? error.message : 'Invalid HTML format'}\n\n// Raw input:\n${inputHtml.value}`;
      return;
    }
  });

  const shikiRef = useSignal<any>(null);
  useVisibleTask$(async ({ track }) => {
    track(() => htmlResult.value);
    if (!htmlResult.value) {
      highlightedHtml.value = '';
      return;
    }
    if (!shikiRef.value) {
      shikiRef.value = await getHighlighter();
    }
    highlightedHtml.value = shikiRef.value.codeToHtml(htmlResult.value, {
      lang: 'html',
      theme: 'nord',
    });
  });

  return (
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="border-glass-border bg-card-item-bg flex h-[60vh] min-h-0 flex-col rounded-xl border">
        <div class="border-glass-border flex items-center justify-between border-b p-3">
          <div class="text-sm font-medium">Input HTML</div>
          {parsingTime.value !== null && (
            <span class="border-glass-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {parsingTime.value}ms
            </span>
          )}
        </div>
        <div class="min-h-0 flex-1 flex-col space-y-3 p-3">
          <textarea
            value={inputHtml.value}
            onInput$={(e: InputEvent, t: HTMLTextAreaElement) =>
              (inputHtml.value = (t as HTMLTextAreaElement).value)
            }
            placeholder="Paste HTML and click to parse/format."
            class="border-glass-border bg-card-item-bg text-foreground placeholder:text-muted-foreground h-full min-h-0 w-full flex-1 resize-none rounded-md border p-3 font-mono text-sm"
          />
          <div class="flex items-center gap-3">
            <button
              onClick$={onParseHtml$}
              class="bg-accent rounded-md px-3 py-1.5 text-sm text-white hover:opacity-90"
            >
              Parse HTML
            </button>
          </div>
        </div>
      </div>

      <div class="border-glass-border bg-card-item-bg flex h-[60vh] min-h-0 flex-col overflow-hidden rounded-xl border">
        <div class="border-glass-border flex items-center justify-between border-b p-3">
          <div class="text-sm font-medium">VNode Tree</div>
          {parsingTime.value !== null && (
            <span class="border-glass-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {parsingTime.value}ms
            </span>
          )}
        </div>
        <div class="h-full min-h-0 flex-1">
          <pre class="h-full overflow-auto" dangerouslySetInnerHTML={highlightedHtml.value || ''} />
        </div>
      </div>
    </div>
  );
});

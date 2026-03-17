import { component$, Slot, useSignal, useStylesScoped$ } from '@qwik.dev/core';
import { EditIcon } from '../svgs/edit-icon';
import CSS from './index.css?inline';
import { lucide } from '@qds.dev/ui';

export default component$<{
  src?: string;
  url?: string;
  tabs?: string[];
  console?: boolean;
  maxHeight?: number;
  style?: Record<string, string>;
}>(({ url, tabs, src, style, console }) => {
  const activeTab = useSignal(0);
  useStylesScoped$(CSS);
  const exampleUrl = (url || src) + (console ? '?console=true' : '');
  return (
    <>
      {tabs && (
        <div class="tabs">
          {tabs.map((tab, idx) => (
            <span
              key={idx}
              onClick$={() => (activeTab.value = idx)}
              class={{ tab: true, active: idx == activeTab.value }}
            >
              {tab}
            </span>
          ))}
        </div>
      )}
      <div class="overflow-auto slot-container mb-4">
        <Slot name={tabs ? String(activeTab.value) : ''} />
      </div>
      <div class="bg-background-base border-[1.6px] border-base rounded-2xl shadow-base overflow-clip">
        <div class="flex items-center gap-4 p-3">
          <div class="flex items-center gap-2">
            <span class="bg-background-accent rounded-full size-3"></span>
            <span class="bg-background-accent rounded-full size-3"></span>
            <span class="bg-background-accent rounded-full size-3"></span>
          </div>
          <div class="bg-background-accent rounded-lg flex-1 px-2 py-1">
            <a
              href={examplePath(exampleUrl)}
              target="_blank"
              class="text-standalone-accent! text-body-xs no-underline! text-ellipsis overflow-hidden block"
            >
              {new URL(examplePath(exampleUrl), 'https://qwik.dev').toString()}
            </a>
          </div>
          <a
            href={'https://github.com/QwikDev/qwik/blob/main/packages/docs/' + (url || src)}
            rel="noopener"
            target="_blank"
            title="edit this snippet"
            class="text-foreground-muted hover:text-foreground-base"
          >
            <lucide.pencil class="size-5 text-foreground-base" />
          </a>
        </div>
        <div class="border-t-[1.6px] border-base">
          <iframe
            loading="lazy"
            src={examplePath(exampleUrl)}
            style={{ width: '100%', height: '200px', ...style }}
            class="border-none m-0 p-2 w-full"
          />
        </div>
      </div>
    </>
  );
});

function examplePath(path: string) {
  const newPath = path
    .replace('/(qwik)/', '/')
    .replace('/(qwikrouter)/', '/')
    .replace('/src/routes/demo', '/demo')
    .replace(/\/[\w\d]+\.tsx?$/, '/');

  return newPath;
}

export const CodeFile = component$<{ src: string }>(() => {
  return <Slot />;
});

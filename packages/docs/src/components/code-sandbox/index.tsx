import { component$, Slot, useSignal, useStylesScoped$ } from '@qwik.dev/core';
import { EditIcon } from '../svgs/edit-icon';
import CSS from './index.css?inline';

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
      <div class="slot-container mb-4 overflow-auto">
        <Slot name={tabs ? String(activeTab.value) : ''} />
      </div>
      <div class="browser shadow-xl">
        <div class="bar justify-left flex flex-row gap-5 rounded-tl-md rounded-tr-md bg-slate-200 px-5 py-2">
          <ul>
            <li>
              <span class="inline-block h-3 w-3 rounded-full bg-red-600"></span>
            </li>
            <li>
              <span class="inline-block h-3 w-3 rounded-full bg-yellow-500"></span>
            </li>
            <li>
              <span class="inline-block h-3 w-3 rounded-full bg-lime-500"></span>
            </li>
          </ul>
          <div class="url inline-grid w-full content-center rounded-md bg-slate-300 px-2 py-1 text-xs whitespace-nowrap">
            <a
              href={examplePath(exampleUrl)}
              target="_blank"
              class="url-link overflow-hidden text-ellipsis"
            >
              {new URL(examplePath(exampleUrl), 'https://qwik.dev').toString()}
            </a>
          </div>
          <ul>
            <li class="edit">
              <a
                href={'https://github.com/QwikDev/qwik/blob/main/packages/docs/' + (url || src)}
                rel="noopener"
                target="_blank"
                title="edit this snippet"
              >
                <EditIcon width={20} height={20} />
              </a>
            </li>
          </ul>
        </div>
        <div>
          <iframe
            loading="lazy"
            src={examplePath(exampleUrl)}
            style={{ width: '100%', height: '200px', ...style }}
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

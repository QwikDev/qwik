import { component$, useContext, useStylesScoped$, Slot, useSignal } from '@builder.io/qwik';
import CSS from './index.css?inline';
import { GlobalStore } from '../../context';
import { EditIcon } from '../svgs/edit-icon';

export default component$<{
  src?: string;
  url?: string;
  tabs?: string[];
  console?: boolean;
  maxHeight?: number;
  style?: Record<string, string>;
}>(({ url, tabs, src, style, console, maxHeight }) => {
  const activeTab = useSignal(0);
  useStylesScoped$(CSS);
  const state = useContext(GlobalStore);
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
      <div class="browser shadow-xl">
        <div class="bar bg-slate-200 rounded-tl-md rounded-tr-md flex flex-row justify-left px-5 py-2 gap-5">
          <ul>
            <li>
              <span class="bg-red-600 rounded-full w-3 h-3 inline-block"></span>
            </li>
            <li>
              <span class="bg-yellow-500 rounded-full w-3 h-3 inline-block"></span>
            </li>
            <li>
              <span class="bg-lime-500 rounded-full w-3 h-3 inline-block"></span>
            </li>
          </ul>
          <div class="url bg-slate-300 rounded-md inline-grid whitespace-nowrap text-xs px-2 py-1 content-center w-full">
            <a
              href={examplePath(exampleUrl)}
              target="_blank"
              class="url-link text-ellipsis overflow-hidden"
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
            src={examplePath({ path: exampleUrl, theme: state.theme, includeTheme: true })}
            style={{ width: '100%', height: '200px', ...style }}
          />
        </div>
      </div>
    </>
  );
});

function examplePath(
  opts:
    | {
        path: string;
        theme?: string;
        includeTheme?: boolean;
      }
    | string
) {
  const {
    path,
    theme = 'light',
    includeTheme = false,
  } = typeof opts === 'string' ? ({ path: opts } as any) : opts;
  const newPath = path
    .replace('/(qwik)/', '/')
    .replace('/(qwikcity)/', '/')
    .replace('/src/routes/demo', '/demo')
    .replace(/\/[\w\d]+\.tsx?$/, '/');

  if (!includeTheme) {
    return newPath;
  }

  if (newPath.indexOf('?') > -1) {
    return newPath + '&theme=' + theme;
  }

  return newPath + '?theme=' + theme;
}

export const CodeFile = component$<{ src: string }>((props) => {
  return <Slot />;
});

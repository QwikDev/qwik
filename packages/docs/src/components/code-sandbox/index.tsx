import { component$, useContext, useStylesScoped$ } from '@builder.io/qwik';
import CSS from './index.css?inline';
import { GlobalStore } from '../../context';
import { EditIcon } from '../svgs/edit-icon';

export default component$<{
  src: string;
  sandboxStyle: Record<string, string>;
}>(({ src, sandboxStyle }) => {
  useStylesScoped$(CSS);
  const state = useContext(GlobalStore);

  return (
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
          <a href={examplePath(src)} target="_blank" class="url-link text-ellipsis overflow-hidden">
            {new URL(examplePath(src), 'https://qwik.builder.io').toString()}
          </a>
        </div>
        <ul>
          <li class="edit">
            <a href={examplePath(src)} rel="noopener" target="_blank" title="edit this snippet">
              <EditIcon width={20} height={20} />
            </a>
          </li>
        </ul>
      </div>
      <div>
        <iframe
          loading="lazy"
          src={examplePath({ path: src, theme: state.theme, includeTheme: true })}
          style={{ width: '100%', height: '200px', ...sandboxStyle }}
        />
      </div>
    </div>
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
    .replace('/index.tsx', '/');

  if (!includeTheme) {
    return newPath;
  }

  if (newPath.indexOf('?') > -1) {
    return newPath + '&theme=' + theme;
  }

  return newPath + '?theme=' + theme;
}

import { component$, useContext, useStylesScoped$ } from '@builder.io/qwik';
import { CodeBlock } from '../code-block/code-block';
import { useLocation } from '@builder.io/qwik-city';
import CSS from './index.css?inline';
import { GlobalStore } from '../../context';
// import loadLanguages from 'prismjs/components/';

// loadLanguages(['markup', 'css', 'javascript', 'json', 'jsx', 'tsx']);

export default component$<{
  src: { code: string; path: string };
  sandbox: boolean;
  sandboxStyle: Record<string, string>;
}>(({ src, sandbox, sandboxStyle }) => {
  useStylesScoped$(CSS);
  const location = useLocation();
  const state = useContext(GlobalStore);
  const browserURL = new URL(examplePath({ path: src.path }), location.url).toString();
  return (
    <div>
      <CodeBlock code={src.code} path={src.path} language="javascript" />
      {sandbox !== false && (
        <div class="browser shadow-xl">
          <div class="bar bg-slate-200 rounded-tl-md rounded-tr-md flex flex-row justify-left px-5 py-2 gap-6">
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
              <a href={browserURL} target="_blank" class="url-link text-ellipsis overflow-hidden">
                {browserURL}
              </a>
            </div>
          </div>
          <div>
            <iframe
              loading="lazy"
              src={examplePath({ path: src.path, theme: state.theme, includeTheme: true })}
              style={{ width: '100%', height: '200px', ...sandboxStyle }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

function examplePath({
  path,
  theme = 'light',
  includeTheme = false,
}: {
  path: string;
  theme?: string;
  includeTheme?: boolean;
}) {
  const newPath = path
    .replace('/(qwik)/', '/')
    .replace('/(qwikcity)/', '/')
    .replace('/src/routes/docs', '/docs')
    .replace('/index!.tsx', '/');

  if (!includeTheme) {
    return newPath;
  }

  if (newPath.indexOf('?') > -1) {
    return newPath + '&theme=' + theme;
  }

  return newPath + '?theme=' + theme;
}

import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { CodeBlock } from '../code-block/code-block';
import { useLocation } from '@builder.io/qwik-city';
import CSS from './index.css?inline';

export default component$<{
  src: { code: string; path: string };
  sandbox: boolean;
  sandboxStyle: Record<string, string>;
}>(({ src, sandbox, sandboxStyle }) => {
  useStylesScoped$(CSS);
  const location = useLocation();
  const browserURL = new URL(examplePath(src.path), location.url).toString();
  return (
    <div>
      <CodeBlock code={src.code} path={src.path} language="tsx" />
      {sandbox !== false && (
        <div class="browser">
          <div class="bar">
            <ol>
              <li>←</li>
              <li>→</li>
              <li>⟳</li>
            </ol>
            <a class="url" href={browserURL} target="_blank">
              {browserURL}
            </a>
          </div>
          <div class="iframe">
            <iframe
              loading="lazy"
              src={examplePath(src.path)}
              style={{ width: '100%', height: '200px', ...sandboxStyle }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

function examplePath(path: string) {
  return path
    .replace('/(qwik)/', '/')
    .replace('/(qwikcity)/', '/')
    .replace('/src/routes/demo', '/demo')
    .replace('/index.tsx', '/');
}

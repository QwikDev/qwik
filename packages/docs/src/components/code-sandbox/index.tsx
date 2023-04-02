import { component$, useStylesScoped$ } from '@builder.io/qwik';
import CSS from './index.css?inline';

export default component$<{
  src: string;
  sandboxStyle: Record<string, string>;
}>(({ src, sandboxStyle }) => {
  useStylesScoped$(CSS);
  return (
    <div class="browser">
      <div class="bar">
        <ol>
          <li>←</li>
          <li>→</li>
          <li>⟳</li>
        </ol>
        <a class="url" href={examplePath(src)} target="_blank">
          {new URL(examplePath(src), 'https://qwik.builder.io').toString()}
        </a>
      </div>
      <div class="iframe">
        <iframe
          loading="lazy"
          src={examplePath(src)}
          style={{ width: '100%', height: '200px', ...sandboxStyle }}
        />
      </div>
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

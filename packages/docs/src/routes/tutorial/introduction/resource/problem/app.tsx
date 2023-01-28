/* eslint-disable no-console */
import { component$, useStore, Resource, useResource$ } from '@builder.io/qwik';

export default component$(() => {
  const github = useStore({
    org: 'BuilderIO',
  });

  const reposResource = '__implement resource with useResource$ here.__'

  console.log('Render');
  return (
    <div>
      <span>
        GitHub username:
        <input
          value={github.org}
          onInput$={(ev) => (github.org = (ev.target as HTMLInputElement).value)}
        />
      </span>
      <div>
        __Insert Resource component and use reposResource here.__
      </div>
    </div>
  );
});

export async function getRepositories(
  username: string,
  controller?: AbortController
): Promise<string[]> {
  console.log('FETCH', `https://api.github.com/users/${username}/repos`);
  const resp = await fetch(`https://api.github.com/users/${username}/repos`, {
    signal: controller?.signal,
  });
  console.log('FETCH resolved');
  const json = await resp.json();
  return Array.isArray(json)
    ? json.map((repo: { name: string }) => repo.name)
    : Promise.reject(json);
}

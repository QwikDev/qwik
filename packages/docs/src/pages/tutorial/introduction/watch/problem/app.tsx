import { component$, useStore, useWatch$ } from '@builder.io/qwik';

export const App = component$(() => {
  const github = useStore({
    org: 'BuilderIO',
    repos: ['qwik', 'partytown'] as string[] | null,
  });

  useWatch$(() => {});

  return (
    <div>
      <span>
        GitHub username:
        <input
          value={github.org}
          onKeyUp$={(ev) => (github.org = (ev.target as HTMLInputElement).value)}
        />
      </span>
      <div>
        {github.repos ? (
          <ul>
            {github.repos.map((repo) => (
              <li>
                <a href={`https://github.com/${github.org}/${repo}`}>{repo}</a>
              </li>
            ))}
          </ul>
        ) : (
          'loading...'
        )}
      </div>
    </div>
  );
});

export async function getRepositories(username: string, controller?: AbortController) {
  const resp = await fetch(`https://api.github.com/users/${username}/repos`, {
    signal: controller?.signal,
  });
  const json = await resp.json();
  return Array.isArray(json) ? json.map((repo: { name: string }) => repo.name) : null;
}

export const isServer = (() => {
  // This is a workaround for a bug in REPL which fails to package up of @builder.io/qwik/build.
  // TODO remove this when the bug is fixed.
  try {
    return typeof window == 'undefined';
  } catch (e) {
    return false;
  }
})();

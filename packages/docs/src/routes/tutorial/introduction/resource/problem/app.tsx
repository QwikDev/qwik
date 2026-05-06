// @ts-ignore: Unused import
import { component$, useSignal, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const githubOrg = useSignal('QwikDev');

  // Use useAsync$() to set up how the data is fetched from the server.
  // See the example for Fetching Data in the text on the left.
  // @ts-ignore: Unused declaration
  const repos = useAsync$(({ track, abortSignal }) => {
    // We need a way to re-run fetching data whenever sthe `github.org` changes.
    // Use `track` to trigger re-running of the this data fetching function.
    const org = track(githubOrg);

    // The abortSignal is automatically aborted when this function re-runs,
    // canceling any pending fetch requests.

    // Fetch the data and return the promises.
    return getRepositories(org, abortSignal);
  });

  console.log('Render');
  return (
    <main>
      <p>
        <label>
          GitHub username:
          <input bind:value={githubOrg} />
        </label>
      </p>
      <section>
        {/* Display the async signal data using its properties. */}
        {/* To help, here's a callback function to display the data: */}
        {/* repos.loading && <div>Loading...</div> */}
        {/* repos.error && <div>Error: {repos.error.message}</div> */}
        {/* repos.value && (
            <ul>
              {repos.value.map((repo) => (
                <li>
                  <a href={`https://github.com/${githubOrg.value}/${repo}`}>{repo}</a>
                </li>
              ))}
            </ul>
          ) */}
      </section>
    </main>
  );
});

export async function getRepositories(
  username: string,
  abortSignal?: AbortSignal
): Promise<string[]> {
  console.log('FETCH', `https://api.github.com/users/${username}/repos`);
  const resp = await fetch(`https://api.github.com/users/${username}/repos`, {
    signal: abortSignal,
  });
  console.log('FETCH resolved');
  const json = await resp.json();
  return Array.isArray(json)
    ? json.map((repo: { name: string }) => repo.name)
    : Promise.reject(json);
}

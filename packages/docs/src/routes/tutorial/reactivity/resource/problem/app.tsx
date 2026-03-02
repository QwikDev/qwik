// @ts-ignore: Unused import
import { component$, useSignal, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const githubOrg = useSignal('QwikDev');

  // Use useAsync$() to set up how the data is fetched from the server.
  // See the example for Fetching Data in the text on the left.
  // @ts-ignore: Unused declaration
  const reposResource = useAsync$<string[]>(({ track, abortSignal }) => {
    // We need a way to re-run fetching data whenever the `github.org` changes.
    // Use `track` to trigger re-running of the this data fetching function.
    const org = track(githubOrg);

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
        {/* reposResource.loading && <div>Loading...</div> */}
        {/* reposResource.error && <div>Error: {reposResource.error.message}</div> */}
        {/* reposResource.value && (
            <ul>
              {reposResource.value.map((repo) => (
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

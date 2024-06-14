// @ts-ignore: Unused import
import { component$, useStore, Resource, useResource$ } from '@builder.io/qwik';

export default component$(() => {
  const github = useStore({
    org: 'QwikDev',
  });

  // Use useResource$() to set up how the data is fetched from the server.
  // See the example for Fetching Data in the text on the left.
  // @ts-ignore: Unused declaration
  const reposResource = useResource$<string[]>(({ track, cleanup }) => {
    // We need a way to re-run fetching data whenever the `github.org` changes.
    // Use `track` to trigger re-running of the this data fetching function.
    track(() => github.org);

    // A good practice is to use `AbortController` to abort the fetching of data if
    // new request comes in. We create a new `AbortController` and register a `cleanup`
    // function which is called when this function re-runs.
    const controller = new AbortController();
    cleanup(() => controller.abort());

    // Fetch the data and return the promises.
    return getRepositories(github.org, controller);
  });

  console.log('Render');
  return (
    <main>
      <p>
        <label>
          GitHub username:
          <input value={github.org} onInput$={(ev, el) => (github.org = el.value)} />
        </label>
      </p>
      <section>
        {/* Use <Resource> to display the data from the useResource$() function. */}
        {/* To help, here's a callback function to display the data on resolved. */}
        {/* (repos) => (
            <ul>
              {repos.map((repo) => (
                <li>
                  <a href={`https://github.com/${github.org}/${repo}`}>{repo}</a>
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

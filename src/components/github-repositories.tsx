import {
  component$,
  getPlatform,
  useHostElement,
  useServerMount$,
  useStore,
  useWatch$,
} from "@builder.io/qwik";

export interface GithubRepositoriesProps {
  organization: string;
}

export const GitHubRepositories = component$(
  (props: GithubRepositoriesProps) => {
    const store = useStore({
      organization: props.organization || "BuilderIO",
      repos: null as string[] | null,
    });
    useServerMount$(async () => {
      store.repos = await getRepositories(store.organization);
    });
    useWatch$((track) => {
      track(store, "organization");
      if (getPlatform(useHostElement()).isServer) return;
      store.repos = null;
      const controller = new AbortController();
      getRepositories(store.organization, controller).then(
        (repos) => (store.repos = repos)
      );
      return () => controller.abort();
    });

    return (
      <>
        <span>
          GitHub username:
          <input
            value={store.organization}
            onKeyup$={(e) =>
              (store.organization = (e.target as HTMLInputElement).value)
            }
          />
        </span>
        <div>
          {store.repos ? (
            <ul>
              {store.repos.map((repo) => (
                <li>
                  <a href={`https://github.com/${store.organization}/${repo}`}>
                    {repo}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            "loading..."
          )}
        </div>
      </>
    );
  }
);

export async function getRepositories(
  username: string,
  controller?: AbortController
) {
  const resp = await fetch(`https://api.github.com/users/${username}/repos`, {
    signal: controller?.signal,
  });
  const json = await resp.json();
  return Array.isArray(json)
    ? json.map((repo: { name: string }) => repo.name)
    : null;
}

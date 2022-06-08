import { component$, useStore } from "@builder.io/qwik";

export interface GithubRepositoriesProps {
  organization: string;
}

export const GitHubRepositories = component$(
  (props: GithubRepositoriesProps) => {
    const store = useStore({
      organization: props.organization || "BuilderIO",
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
          <ul>
            <li>
              <a href={`https://github.com/${store.organization}/qwik`}>Qwik</a>
            </li>
          </ul>
        </div>
      </>
    );
  }
);

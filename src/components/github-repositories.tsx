import { component$ } from "@builder.io/qwik";

export interface GithubRepositoriesProps {
  organization: string;
}

export const GitHubRepositories = component$(
  (props: GithubRepositoriesProps) => {
    return (
      <>
        <span>
          GitHub username:
          <input value={props.organization} />
        </span>
        <div>
          <ul>
            <li>
              <a href={`https://github.com/BuilderIO/qwik`}>Qwik</a>
            </li>
          </ul>
        </div>
      </>
    );
  }
);

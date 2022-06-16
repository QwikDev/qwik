import { component$, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const github = useStore({
    organization: 'builderio',
    repos: ['qwik', 'partytown'] as string[] | null,
  });
  return (
    <div>
      <span>
        GitHub username:
        <input
          value={github.organization}
          onKeyUp$={(event) => (github.organization = (event.target as HTMLInputElement).value)}
        />
      </span>
      <div>
        {github.repos ? (
          <ul>
            {github.repos.map((repo) => (
              <li>
                <a href={`https://github.com/${github.organization}/${repo}`}>
                  {github.organization}/{repo}
                </a>
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

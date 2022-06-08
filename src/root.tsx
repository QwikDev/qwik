import { GitHubRepositories } from "./components/github-repositories";

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <GitHubRepositories organization="BuilderIO" />
      </body>
    </html>
  );
};

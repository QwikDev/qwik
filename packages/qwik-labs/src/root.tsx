import { Insights } from './components/insights';

export default () => {
  return (
    <>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Insights publicApiKey="__SELF__" />
      </body>
    </>
  );
};

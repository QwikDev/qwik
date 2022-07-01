import { App } from './components/app/app';
import { Head } from './components/head/head';

export const Root = () => {
  return (
    <html lang="en" className="h-screen">
      <head>
        <Head />
      </head>
      <body>
        <App />
      </body>
    </html>
  );
};

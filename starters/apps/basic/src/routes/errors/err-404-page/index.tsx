import { component$, useStylesScoped$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  useStylesScoped$(`body { color: #006ce9; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
  p { max-width: 600px; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px #006ce9; overflow: hidden; }
  strong { display: inline-block; padding: 15px; background: #006ce9; color: white; }
  span { display: inline-block; padding: 15px; }
  pre { max-width: 580px; margin: 0 auto; }`)
  return (
    <>            
      <p>
        <strong>404</strong>
        <span>Page Not Found</span>
      </p>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Error 404',
};

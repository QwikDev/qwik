import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import styles from '../ecosystem.css?inline';
import data from '../ecosystem.json';

export default component$(() => {
  useStyles$(styles);

  return (
    <article class="ecosystem subsection">
      <h1>Deployments</h1>

      <p>
        When it's time to deploy your application, Qwik comes with ready-to-use integration that
        make this so easy!
      </p>

      <section>
        <h2>Adapters and Middleware</h2>

        <p>
          Qwik City middleware is a glue code that connects server rendering framework (such as
          Cloudflare, Netlify, Vercel, Express etc.) with the Qwik City meta-framework.
        </p>

        <p>Qwik City comes pre-bundled with:</p>

        <ul class="grid">
          {data.deployments.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <span>
                  <img src={d.logo} alt={d.name + ' Logo'} />
                </span>
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Production build</h2>
        <p>
          When a new integration is added to the project, a <code>build.server</code> script is
          added to the <code>package.json</code> file. This script is used to build the project for
          production.
        </p>
        <p>The only thing you need to do is to run the following command:</p>
        <pre>
          <code>npm run build</code>
        </pre>
      </section>

      <section>
        <h2>Advanced</h2>
        <p>
          The <code>requestHandler()</code> utility is what each of the above middleware bundles
          uses in order to translate their request/response to a standard format for Qwik City to
          use. This function can be used to provide middleware for specific server frameworks.
        </p>
        <p>
          If there's middleware missing and you'd like it added, take a look at how the
          <code>requestHandler()</code> utility is used to handle requests for each of the
          middleware source-code above. Better yet, we'd love to have your middleware contributions!{' '}
          <a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware">
            PR's are welcome!
          </a>
        </p>
      </section>
    </article>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Deployments',
};

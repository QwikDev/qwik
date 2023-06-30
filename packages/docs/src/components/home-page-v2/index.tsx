import { component$, useStylesScoped$ } from '@builder.io/qwik';
import STYLES from './index.css?inline';
import { SrcAnimation } from './src-animation';

export default component$(() => {
  useStylesScoped$(STYLES);
  return (
    <main>
      <section class="row">
        <section class="left">
          <p class="tagline">
            The next-generation framework that streams your JS app, no matter how large it is.
          </p>
          <p class="sub-tagline">
            (instantly load any scale of the app with no extra development effort)
          </p>
        </section>
        <section class="right">
          <img src="https://cdn.builder.io/api/v1/image/assets%2Ffe30f73e01ef40558cd69a9493eba2a2%2Fc65b2edb5e354db98e7a62e18eb44543?width=2000&format=webp" />
        </section>
      </section>
      <section class="row">
        <section class="left">
          <img src="https://cdn.builder.io/api/v1/image/assets%2Ffe30f73e01ef40558cd69a9493eba2a2%2Fc65b2edb5e354db98e7a62e18eb44543?width=2000&format=webp" />
        </section>
        <section class="right">
          <p class="box">
            Too much JavaScript is the most significant performance problem on the web today. It
            prevents your site from getting good CWV / PageSpeed scores resulting in a frustrating
            experience for your users and{' '}
            <a href="https://web.dev/tags/case-study/">forgone revenue</a> for you. Qwik’s{' '}
            <a href="/docs/concepts/resumable/">resumability</a> keeps the amount of JavaScript
            small and constant even as your application grows in complexity.
          </p>
          <p class="box">
            Universal execution model seamlessly blends execution of code on the server and client
            in a DX so clean you don't even have to think about it. Powered by{' '}
            <a href="https://www.builder.io/blog/wtf-is-code-extraction">Code Extraction</a>, which
            breaks your application code into small code chunks and delivers them to the correct
            runtime environment enabling the streaming of JavaScript without any developer effort.
          </p>
          <p class="box">
            <a href="/docs/advanced/speculative-module-fetching/">Speculative Module Fetching</a>{' '}
            ensures the code is loaded before user interaction to ensure instant interactivity, even
            on slow or intermittent networks. Collect real-world user behavior to further optimize
            the javascript bundles and speculative module fetching.
          </p>
          <p class="box">
            Qwik is designed so that the easy path for the developer is the performant path for the
            user—no need to know special performance hacks or learn new APIs to optimize the site
            performance. Even your junior developer can create performant sites.
          </p>
        </section>
      </section>
      <section class="row">
        <div style="width: 650px">
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <h1 style="height: 100px">Some Text</h1>
          <SrcAnimation />
        </div>
      </section>
      <section class="row">
        <section class="left">
          <img src="https://cdn.builder.io/api/v1/image/assets%2Ffe30f73e01ef40558cd69a9493eba2a2%2Fc65b2edb5e354db98e7a62e18eb44543?width=2000&format=webp" />
        </section>
        <section class="right">
          <p class="box">
            Qwik goes beyond other meta-frameworks to solve the whole web application creation,
            optimization, and delivery out of the box.
          </p>
          <p class="box">
            SEO-first: SEO is not an afterthought but a fundamental property of Qwik. Turn off
            JavaScript and navigate this site to see what SEO will see.
          </p>
          <p class="box">
            Edge-Enabled: Get even better performance by running your application on edge close to
            your users. Check out our <a href="/ecosystem/">integrations page</a>.
          </p>
          <p class="box">
            SSR/SSG: Server-Side-Rendering? Static-Site-Generation? A mixture of both? Yes, Qwik
            does it all in a way that works well with your CDN.
          </p>
          <p class="box">
            Bundling: Be the master of code-splitting and lazy-loading without writing a single
            dynamic import or refactoring your application. Learn from real-world user behavior and
            adjust the bundles by changing configuration parameters.
          </p>
          <p class="box">
            Integrate your existing React components in Qwik with{' '}
            <a href="/integrations/react/">Qwik-React</a>. Lazy load and hydrate the React
            components for improved startup performance.
          </p>
          <p class="box">
            Reach a <a href="/chat/">community of developers</a> ready to answer your questions on
            Discord.
          </p>
        </section>
      </section>
    </main>
  );
});

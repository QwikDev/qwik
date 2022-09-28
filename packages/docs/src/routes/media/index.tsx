import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './media.css?inline';

export default component$(() => {
  useStyles$(styles);
  return (
    <div class="media">
      <h1>Qwik Presentations, Talks, Videos and Podcasts</h1>

      <section>
        <h2 id="videos">
          <a href="#videos">Videos</a>
        </h2>

        <ul class="thumbnails">
          <li>
            <a href="https://youtu.be/x2eF3YLiNhY" target="_blank">
              <img src="http://i3.ytimg.com/vi/x2eF3YLiNhY/hqdefault.jpg" />
              <p>Qwik… the world's first O(1) JavaScript framework?</p>
            </a>
          </li>
          <li>
            <a href="https://youtu.be/z14c3u9q8rI" target="_blank">
              <img src="http://i3.ytimg.com/vi/z14c3u9q8rI/hqdefault.jpg" />
              <p>Qwik JS and the future of frameworks</p>
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="podcasts">
          <a href="#podcasts">Podcasts</a>
        </h2>

        <ul class="thumbnails">
          <li>
            <a href="https://www.youtube.com/watch?v=_PDpoJUacuc" target="_blank">
              <img src="http://i3.ytimg.com/vi/_PDpoJUacuc/hqdefault.jpg" />
              <p>Build Resumable Apps with Qwik</p>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=iJZaT-AvJ-o" target="_blank">
              <img src="http://i3.ytimg.com/vi/iJZaT-AvJ-o/hqdefault.jpg" />
              <p>Introducing Qwik w/ Misko Hevery &amp; Shai Reznik</p>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=LbMRs7l4czI" target="_blank">
              <img src="http://i3.ytimg.com/vi/LbMRs7l4czI/hqdefault.jpg" />
              <p>Resumable Apps in Qwik</p>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=0tCuUQe_ZA0" target="_blank">
              <img src="http://i3.ytimg.com/vi/0tCuUQe_ZA0/hqdefault.jpg" />
              <p>Qwik: A no-hydration instant-on personalized web applications</p>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=7MgNMIPISY4" target="_blank">
              <img src="http://i3.ytimg.com/vi/7MgNMIPISY4/hqdefault.jpg" />
              <p>QWIK - Set of great demos by Misko Hevery</p>
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="presentations">
          <a href="#presentations">Presentations</a>
        </h2>

        <ul class="thumbnails">
          <li>
            <a href="https://www.youtube.com/watch?v=0dC11DMR3fU&amp;t=154s" target="_blank">
              <img src="http://i3.ytimg.com/vi/0dC11DMR3fU/hqdefault.jpg" />
              <p>WWC22 - Qwik + Partytown: How to remove 99% of JavaScript from main thread</p>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=GHbNaDSWUX8" target="_blank">
              <img src="http://i3.ytimg.com/vi/GHbNaDSWUX8/hqdefault.jpg" />
              <p>Qwik Workshop Part 1 - Live Coding</p>
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="resources">
          <a href="#resources">Resources</a>
        </h2>

        <ul class="bullets">
          <li>
            <a
              href="https://docs.google.com/presentation/d/1Jj1iw0lmaecxtUpqyNdF1aBzbCVnSlbPGLbOpN2xydc/edit#slide=id.g13225ffe116_6_234"
              target="_blank"
            >
              Qwik: Instant-on, resumable WebApps - Google Presentation
            </a>
          </li>
          <li>
            <a href="/logos/qwik-logo.svg" target="_blank">
              Qwik SVG Logo [svg]
            </a>
          </li>
          <li>
            <a href="/logos/qwik.svg" target="_blank">
              Qwik Logo and Text [svg]
            </a>
          </li>
          <li>
            <a href="/logos/qwik.png" target="_blank">
              Qwik Logo and Text [png]
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Add Media</h2>
        <p>This page missing any great resources or in need of an update?</p>
        <p>
          <a
            href="https://github.com/BuilderIO/qwik/edit/main/packages/docs/src/routes/media/index.tsx"
            target="_blank"
            class="edit-page"
          >
            Edit this page!
          </a>
        </p>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Presentations, Talks, Videos and Podcasts',
};

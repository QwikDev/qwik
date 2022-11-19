import { component$, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';
import { TwitterLogo } from '../svgs/twitter-logo';
import { GithubLogo } from '../svgs/github-logo';
import { DiscordLogo } from '../svgs/discord-logo';
import { BuilderLogo } from '../svgs/builder-logo';

export const Footer = component$(() => {
  useStyles$(styles);

  return (
    <footer class="container mx-auto px-4 md:px-0 mt-4">
      <div class="made-with-love">Made with ❤️ by</div>
      <div class="footer-top">
        <a href="https://www.builder.io" target="_blank" class="builder-logo">
          <BuilderLogo width={160} height={34} />
        </a>
        <ul class="footer-social">
          <li>
            <a href="https://qwik.builder.io/chat" target="_blank" title="Discord">
              <DiscordLogo width={22} height={22} />
            </a>
          </li>
          <li>
            <a href="https://github.com/BuilderIO/qwik" target="_blank" title="GitHub">
              <GithubLogo width={22} height={22} />
            </a>
          </li>
          <li>
            <a href="https://twitter.com/qwikdev" target="_blank" title="Twitter">
              <TwitterLogo width={22} height={22} />
            </a>
          </li>
        </ul>
      </div>
      <div class="footer-bottom">© 2022 Builder.io, Inc.</div>
    </footer>
  );
});

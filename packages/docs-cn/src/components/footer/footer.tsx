import { component$, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';
import builder from './builder.svg';
import { TwitterLogo } from '../svgs/twitter-logo';
import { GithubLogo } from '../svgs/github-logo';
import { DiscordLogo } from '../svgs/discord-logo';

export const Footer = component$(() => {
  useStyles$(styles);

  return (
    <footer class="container mx-auto px-4 md:px-0 mt-4">
      <div class="made-with-love">Made with ❤️ by</div>
      <div class="footer-top">
        <a href="https://www.builder.io" target="_blank">
          <img
            class="builder-logo"
            width="312"
            height="67"
            src={builder}
            alt="Builder.io logo"
            loading="lazy"
          />
        </a>
        <ul class="footer-social">
          <li>
            <a href="https://qwik.builder.io/chat" target="_blank" title="Discord">
              <DiscordLogo width={22} height={22} />
            </a>
          </li>
          <li>
            <a href="https://github.com/BuilderIO/qwik" target="_blank" title="Github">
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

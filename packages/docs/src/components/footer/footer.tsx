import { component$, useStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';
import builder from './builder.svg';
import { TwitterLogo } from '../svgs/twitter-logo';
import { GithubLogo } from '../svgs/github-logo';
export const Footer = component$(() => {
  useStyles$(styles);

  return (
    <footer>
      <div class="made-with-love">Made with love by</div>
      <div class="footer-top">
        <img class="builder-logo" src={builder} alt="Builder.io logo" />
        <ul class="footer-social">
          <li>
            <a href="https://github.com/BuilderIO" target="_blank" title="Github">
              <span class="md:hidden">Github</span>
              <span class="hidden md:block">
                <GithubLogo width={22} height={22} />
              </span>
            </a>
          </li>
          <li>
            <a href="https://twitter.com/builderio" target="_blank" title="Twitter">
              <span class="md:hidden">@builderio</span>
              <span class="hidden md:block">
                <TwitterLogo width={22} height={22} />
              </span>
            </a>
          </li>
        </ul>
      </div>
      <div class="footer-bottom">© 2022 Builder.io, Inc.</div>
    </footer>
  );
});

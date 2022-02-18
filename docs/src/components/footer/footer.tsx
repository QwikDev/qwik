import { component$, Host, useStyles$, $ } from '@builder.io/qwik';
import styles from './footer.css';

export const Footer = component$(
  () => {
    useStyles$(styles);

    return $(() => (
      <Host class="p-4 border-t border-slate-700 flex justify-between">
        <div class="py-1">
          <span>Made with 💜 by the </span>
          <a href="https://www.builder.io/">Builder.io</a>
          <span> team</span>
        </div>
        <nav class="flex">
          <a class="px-3 py-1" href="https://github.com/BuilderIO/qwik">
            Github
          </a>
        </nav>
      </Host>
    ));
  },
  { tagName: 'footer' }
);

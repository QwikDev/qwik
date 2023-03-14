import { type Signal, component$, useStylesScoped$ } from '@builder.io/qwik';
import styles from './footer.css?inline';

export default component$(({ serverTime }: { serverTime: Signal<{ date: string }> }) => {
  useStylesScoped$(styles);

  return (
    <footer>
      <a href="https://www.builder.io/" target="_blank">
        Made with ♡ by Builder.io
        <span class="spacer">|</span>
        <span>{serverTime.value.date}</span>
      </a>
    </footer>
  );
});

import { component$, Host } from '@builder.io/qwik';
import logoPng from './logo.png';

export const Logo = component$(() => {
  return (
    <Host style={{ 'text-align': 'center' }}>
      <a href="https://qwik.builder.io/">
        <img alt="Qwik Logo" width={400} height={147} src={logoPng} />
      </a>
    </Host>
  );
});

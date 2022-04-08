import { component$, Host } from '@builder.io/qwik';

export const Logo = component$(() => {
  return (
    <Host style={{ 'text-align': 'center' }}>
      <a href="https://github.com/builderio/qwik">
        <img
          alt="Qwik Logo"
          width={400}
          src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"
        />
      </a>
    </Host>
  );
});

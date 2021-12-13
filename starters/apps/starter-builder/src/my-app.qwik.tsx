import { h, Fragment } from '@builder.io/qwik';
import { qComponent, qHook } from '@builder.io/qwik';

export const Header = qComponent<{}, { name: string }>({
  onRender: qHook(() => {
    return (
      <p style={{ 'text-align': 'center' }}>
        <a href="https://github.com/builderio/qwik">
          <img
            alt="Qwik Logo"
            width={400}
            src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"
          />
        </a>
      </p>
    );
  }),
});

export const Footer = qComponent<{}, { name: string }>({
  onRender: qHook(() => {
    return (
      <>
        <hr />
        <p style={{ 'text-align': 'center' }}>
          Made with ❤️ by{' '}
          <a target="_blank" href="https://www.builder.io/">
            Builder.io
          </a>
        </p>
      </>
    );
  }),
});

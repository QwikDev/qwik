import { component$ } from '@qwik.dev/core';
import { useNavigate } from '@qwik.dev/router';

export default component$(() => {
  const nav = useNavigate();
  return (
    <div>
      <h1 id="double-nav-a">Route A</h1>
      <button
        id="double-nav-btn"
        onClick$={() => {
          // Fire two navigations back-to-back without awaiting
          nav('/qwikrouter-test/double-nav/b/');
          nav('/qwikrouter-test/double-nav/c/');
        }}
      >
        Double Nav
      </button>
      <button
        id="double-nav-render-btn"
        onClick$={() => {
          nav('/qwikrouter-test/double-nav/b/');
          queueMicrotask(() => nav('/qwikrouter-test/double-nav/c/'));
        }}
      >
        Double Nav During Render
      </button>
    </div>
  );
});

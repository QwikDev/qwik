import { component$ } from '@qwik.dev/core';
import { useNavigate } from '@qwik.dev/router';

export default component$(() => {
  const nav = useNavigate();
  return (
    <div>
      <h1 id="loader-redirect-home">Loader Redirect Home</h1>
      <button
        id="loader-redirect-btn"
        onClick$={() => {
          nav('/qwikrouter-test/loader-redirect/source/?redirect');
        }}
      >
        Navigate to source with redirect
      </button>
    </div>
  );
});

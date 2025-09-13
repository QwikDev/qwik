import { component$, Slot, useSignal, useStyles$ } from "@qwik.dev/core";
import { Link, type DocumentHead } from "@qwik.dev/router";

export default component$(() => {
  useStyles$(`
    .layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      background-color: #1f2937;
      color: white;
      padding: 1rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    .nav-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .nav {
      display: flex;
      gap: 1rem;
    }

    .nav a {
      color: white;
      text-decoration: none;
    }

    .nav a:hover {
      color: #d1d5db;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toggle-text {
      font-size: 0.875rem;
    }

    .main {
      flex-grow: 1;
    }
  `);

  const isSPA = useSignal(true);
  const LinkCmp = isSPA.value ? Link : "a";

  return (
    <div class="layout">
      <header class="header">
        <div class="container nav-container">
          <nav class="nav">
            <LinkCmp href="/">Home</LinkCmp>
            <LinkCmp href="/form">Form</LinkCmp>
            <LinkCmp href="/about">About</LinkCmp>
            <LinkCmp
              href="/counters"
              // eslint-disable-next-line no-console
              onQVisible$={() => console.log("visible")}
            >
              Counters
            </LinkCmp>
          </nav>
          <label class="toggle-label">
            <input type="checkbox" bind:checked={isSPA} />
            <span class="toggle-text">Use SPA links</span>
          </label>
        </div>
      </header>

      <main class="main container">
        <Slot />
      </main>
      {/* workaround: invisible Link to ensure qwik Router context inclusion */}
      <Link href="/" />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Preloader Test",
};

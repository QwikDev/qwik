import { component$, useStyles$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  useStyles$(`
    .about-container {
      max-width: 42rem;
      margin: 0 auto;
    }

    .title {
      font-size: 1.875rem;
      font-weight: bold;
      margin-bottom: 1rem;
    }

    .content {
      font-size: 1rem;
      line-height: 1.5;
    }

    .paragraph {
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.5rem;
      font-weight: bold;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }

    .feature-list {
      list-style-type: disc;
      padding-left: 1.25rem;
      margin-bottom: 1rem;
    }

    .feature-list li {
      margin-bottom: 0.5rem;
    }
  `);

  return (
    <div class="about-container">
      <h1 class="title">About Preloader Test</h1>
      <div class="content">
        <p class="paragraph">
          This application demonstrates the preloading capabilities of Qwik. It
          shows how Qwik can efficiently load only the necessary JavaScript code
          when needed, resulting in faster page loads and better performance.
        </p>
        <h2 class="subtitle">Features</h2>
        <ul class="feature-list">
          <li>Route-based code splitting</li>
          <li>Form handling with validation</li>
          <li>Toggle between native links and Qwik Link components</li>
          <li>Responsive design with CSS</li>
        </ul>
        <p class="paragraph">
          Feel free to explore the different pages and observe how Qwik handles
          navigation and form interactions efficiently.
        </p>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "About - Preloader Test",
  meta: [
    {
      name: "description",
      content: "Learn about the Preloader Test application and its features",
    },
  ],
};

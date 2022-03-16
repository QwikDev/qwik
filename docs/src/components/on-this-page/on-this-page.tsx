import { component$, Host, $ } from '@builder.io/qwik';

export const OnThisPage = component$(
  () => {
    return $(() => (
      <Host class="on-this-page">
        <nav>
          <div>On This Page</div>
          <ul>
            <li>Overview</li>
          </ul>
        </nav>
      </Host>
    ));
  },
  { tagName: 'aside' }
);

import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

export default component$(() => (
  <div>
    <p>
      <Link href="/qwikcity-test/issue4502/broken">Broken Link</Link>
    </p>
    <p>
      <a href="/qwikcity-test/issue4502/broken">Working a</a>
    </p>
  </div>
));

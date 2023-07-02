import './styles.css';

import { Link } from '@builder.io/qwik-city';
import { QwikIcon } from '../icons/qwik';
import { component$ } from '@builder.io/qwik';

// import { paths } from "~/routes/layout";

export default component$(() => {
  return (
    <header class="section">
      <Link href="/" class="logo">
        <QwikIcon width="46" height="50" />
      </Link>
      <span class="title">Insights</span>
    </header>
  );
});

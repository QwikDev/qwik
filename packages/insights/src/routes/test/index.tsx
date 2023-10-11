import { component$ } from '@builder.io/qwik';
import { AppLink } from '~/routes.config';

export default component$(() => {
  return (
    <div>
      <ul>
        <li>
          <AppLink route="/test/visible-task/">Time (useVisibleTask)</AppLink>
        </li>
        <li>
          <AppLink route="/test/counter/">Counter</AppLink>
        </li>
      </ul>
    </div>
  );
});

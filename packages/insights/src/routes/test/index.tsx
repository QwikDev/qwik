import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <div>
      <ul>
        <li>
          <a href="/test/visible-task/">Time (useVisibleTask)</a>
        </li>
        <li>
          <a href="/test/counter/">Counter</a>
        </li>
      </ul>
    </div>
  );
});

import { useLocation } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  const location = useLocation();
  return (
    <div>
      <h1>useLocation()</h1>
      <ul>
        <li>
          URL: <span class="url">{location.url.href}</span>
        </li>
      </ul>
    </div>
  );
});

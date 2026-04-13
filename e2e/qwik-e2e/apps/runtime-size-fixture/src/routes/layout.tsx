import { component$, Slot } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <nav>
        <Link href="/">home</Link>
        <br />
        <Link href="/counter/">counter</Link>
        <br />
        <Link href="/reveal/">reveal</Link>
        <br />
        <Link href="/task/">task</Link>
        <br />
        <Link href="/visible-task/">visible-task</Link>
        <br />
        <Link href="/use-async/">use-async</Link>
        <br />
        <Link href="/use-computed/">use-computed</Link>
        <br />
        <Link href="/route-loader/">route-loader</Link>
        <br />
        <Link href="/route-action/">route-action</Link>
      </nav>
      <br />

      <main>
        <Slot />
      </main>
    </>
  );
});

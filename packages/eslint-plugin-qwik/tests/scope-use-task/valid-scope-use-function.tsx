import { component$, isServer, useTask$ } from '@qwik.dev/core';
import path from 'path';
export default component$(() => {
  useTask$(() => {
    function child_process() {}
    function foo() {
      if (isServer) {
        process.env;
        const m = process;
        const _path = path;
        const pathJoin = path.join('foo', 'bar');
      }
    }
    child_process();
    const foo2 = () => {
      if (isServer) {
        process.env;
        const m = process;
      }
    };
    foo();
    foo2();
  });
  return <></>;
});

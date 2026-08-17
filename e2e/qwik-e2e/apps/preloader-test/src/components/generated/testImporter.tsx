import {
  component$,
  useComputed$,
  useSignal,
  useStyles$,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import Test1 from './test1';
import Test2 from './test2';
import Test3 from './test3';
import Test4 from './test4';
import Test5 from './test5';
import Test6 from './test6';
import Test7 from './test7';
import Test8 from './test8';
import Test9 from './test9';
import { useTheme } from './use-theme';
import { testLogger } from './test-logger';

export const TestImporter = component$(() => {
  const theme = useTheme();

  useTask$(({ track }) => {
    track(() => theme.value);
    testLogger();
  });

  return (
    <>
      <div
        style={{
          backgroundColor: theme.value === 'dark' ? 'green' : 'yellow',
        }}
      >
        <p>TestImporter</p>
        <Test1 />
        <Test2 />
        <Test3 />
        <Test4 />
        <Test5 />
        <Test6 />
        <Test7 />
        <Test8 />
        <Test9 />
      </div>
    </>
  );
});

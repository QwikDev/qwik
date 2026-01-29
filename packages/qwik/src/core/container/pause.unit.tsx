import type { SymbolMapper, SymbolMapperFn } from '../../optimizer/src/types';
import { componentQrl } from '../component/component.public';
import { useComputedQrl } from '../use/use-task';
import { useSignal } from '../use/use-signal';
import { renderToString } from '../../server/render';
import { assert, test } from 'vitest';
import { inlinedQrl } from '../qrl/qrl';

const symbolMapper: SymbolMapperFn = (symbolName: string, mapper: SymbolMapper | undefined) => {
  return [symbolName, `q-${symbolName}.js`];
};

test('issue-4979', async () => {
  await renderToString(<Issue4979 />, {
    containerTagName: 'div',
    symbolMapper: symbolMapper,
    manifest: {} as any,
  });

  assert(true, 'Serialized successfully');
});

export const Issue4979Inner = componentQrl<{ value: number }>(
  inlinedQrl(
    (props) => {
      const foo = useComputedQrl(
        inlinedQrl(
          () => {
            return Object.entries(props);
          },
          's_foo',
          [props]
        )
      );

      return <span {...foo.value} />;
    },
    's_issue4979Inner',
    []
  )
);

export const Issue4979 = componentQrl(
  inlinedQrl(
    () => {
      const pageSig = useSignal(1);

      const currentDataSig = useComputedQrl(
        inlinedQrl(
          () => {
            return [pageSig.value];
          },
          's_currentData',
          [pageSig]
        )
      );

      return (
        <>
          <button onClick$={inlinedQrl(() => (pageSig.value += 1), 's_click', [pageSig])}>
            Next
          </button>
          {currentDataSig.value.map((o) => (
            <Issue4979Inner key={o} value={o} />
          ))}
        </>
      );
    },
    's_issue4979',
    []
  )
);

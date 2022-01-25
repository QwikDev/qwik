//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, Async, PromiseValue } from '@builder.io/qwik';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: PromiseValue
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

export const PromiseValue_1 = () => (
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  <Async resolve={Promise.resolve('some value')}>
    {(response: PromiseValue<string>) => {
      if (response.isPending) return <span>loading...</span>;
      if (response.isResolved) return <span>{response.value}</span>;
      if (response.isRejected) return <pre>{response.rejection}</pre>;
    }}
  </Async>
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
);

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: Async
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

export const Async_1 = () => (
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  <Async
    resolve={Promise.resolve('some value')}
    onPending={() => <span>loading...</span>}
    onResolved={(value) => <span>{value}</span>}
    onError={(rejection) => <pre>{rejection}</pre>}
  />
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
);

export const Async_2 = () => (
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  <Async resolve={Promise.resolve('some value')}>
    {(response) => {
      if (response.isPending) return <span>loading...</span>;
      if (response.isResolved) return <span>{response.value}</span>;
      if (response.isRejected) return <pre>{response.rejection}</pre>;
    }}
  </Async>
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
);

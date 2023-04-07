/** @jsxImportSource react */
import { qwikify$ } from '@builder.io/qwik-react';

function Button({ onClick }: { onClick: () => void }) {
  console.log('React <Button/> Render');
  return <button onClick={onClick}>+1</button>;
}

function Display({ count }: { count: number }) {
  console.log('React <Display count=' + count + '/> Render');
  return <div className="react">Count: {count}</div>;
}

export const QButton = qwikify$(Button, { eagerness: 'hover' });
export const QDisplay = qwikify$(Display);

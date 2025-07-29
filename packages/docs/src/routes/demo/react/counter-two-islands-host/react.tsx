/** @jsxImportSource react */

import { qwikify$ } from '@qwik.dev/react';
import { type ReactNode } from 'react';

function Button({ children }: { children?: ReactNode[] }) {
  console.log('React <Button/> Render');
  return <button>{children}</button>;
}

function Display({ count }: { count: number }) {
  console.log('React <Display count=' + count + '/> Render');
  return <div className="react">Count: {count}</div>;
}

export const QButton = qwikify$(Button);
export const QDisplay = qwikify$(Display);

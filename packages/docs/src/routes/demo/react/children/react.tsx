/** @jsxImportSource react */

import { type ReactNode } from 'react';
import { qwikify$ } from '@builder.io/qwik-react';

function Frame({ children }: { children?: ReactNode[] }) {
  console.log('React <Zippy/> Render');
  return (
    <div
      style={{
        display: 'inline-block',
        border: '1px solid black',
        borderRadius: '10px',
        padding: '5px',
      }}
    >
      {children}
    </div>
  );
}

export const QFrame = qwikify$(Frame);

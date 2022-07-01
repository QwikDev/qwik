/** @jsxImportSource react */

import { qwikify$ } from '@builder.io/qwik-react';
import { Button } from '@mui/material';

export function ReactCmp() {
  return (
    <>
      <Button>Button</Button>
    </>
  );
}

export const ReactRoot = qwikify$(ReactCmp);

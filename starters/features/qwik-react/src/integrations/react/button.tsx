/** @jsxImportSource react */

import { qwikify$ } from '@builder.io/qwik-react';
import { Button } from '@mui/material';

// qwikify$() takes a react component and returns
// a Qwik component that delivers zero JS
export const MUIButton = qwikify$(() => {
  return (
    <>
      <Button>Hello from React</Button>
    </>
  );
});

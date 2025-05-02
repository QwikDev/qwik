/** @jsxImportSource react */

import { qwikify$ } from '@builder.io/qwik-react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { type ReactNode } from 'react';

export const Example = qwikify$(
  function Example({
    selected,
    onSelected,
    children,
  }: {
    selected: number;
    onSelected: (v: number) => any;
    children?: ReactNode[];
  }) {
    console.log('React <Example/> Render');
    return (
      <>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={selected}
            onChange={(e, v) => onSelected(v)}
            aria-label="basic tabs example"
          >
            <Tab label="Item One" />
            <Tab label="Item Two" />
            <Tab label="Item Three" />
          </Tabs>
          {children}
        </Box>
      </>
    );
  },
  { eagerness: 'hover' }
);

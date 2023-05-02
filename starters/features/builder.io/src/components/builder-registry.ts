import type { RegisteredComponent } from '@builder.io/sdk-qwik';
import { MyFunComponent } from './fun/fun';

// You will find these components in the "custom components"
// section of the visual editor
// You can also turn on "components only mode" to limit
// editing to only these components
// https://www.builder.io/c/docs/guides/components-only-mode
export const CUSTOM_COMPONENTS: RegisteredComponent[] = [
  {
    component: MyFunComponent,
    name: 'MyFunComponent',
    inputs: [
      {
        name: 'text',
        type: 'string',
        defaultValue: 'Hello world',
      },
    ],
  },
];

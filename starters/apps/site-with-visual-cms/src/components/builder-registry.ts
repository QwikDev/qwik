import type { RegisteredComponent } from '@builder.io/sdk-qwik';
import Counter from './counter/counter';

export const CUSTOM_COMPONENTS: RegisteredComponent[] = [
  {
    component: Counter,
    name: 'Counter',
    inputs: [
      {
        name: 'initialValue',
        type: 'number',
      },
    ],
  },
];

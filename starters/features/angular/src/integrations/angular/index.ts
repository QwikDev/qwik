import { qwikify$ } from '@builder.io/qwik-angular';
import { QwikAngularDemo } from './components/demo/demo.component';

export const DemoComponent = qwikify$<{
  contentOption: 'one' | 'two';
  hello?: (greeting: string) => void;
}>(QwikAngularDemo);

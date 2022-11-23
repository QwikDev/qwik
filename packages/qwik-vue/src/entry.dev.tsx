import { render, RenderOptions } from '@builder.io/qwik';
import { Root } from './root';

export default function (opts: RenderOptions) {
  return render(document, <Root />, opts);
}

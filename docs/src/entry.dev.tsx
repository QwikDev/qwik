import { render } from '@builder.io/qwik';
import { Root } from './root';

function bootstrapClient() {
  render(document, <Root />);
}

bootstrapClient();

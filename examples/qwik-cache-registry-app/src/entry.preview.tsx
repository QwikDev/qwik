import { createQwikRouter } from '@qwik.dev/router/middleware/node';
import render from './entry.ssr';

export default createQwikRouter({ render });

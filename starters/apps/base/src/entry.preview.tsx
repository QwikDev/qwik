import { qwikCity } from '@builder.io/qwik-city/middleware/node';
import render from './entry.ssr';

// Create the Qwik City ssr preview middleware
// Imported by vite preview
export default qwikCity(render);

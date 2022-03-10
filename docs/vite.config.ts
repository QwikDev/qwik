import { defineConfig } from 'vite';
import { join } from 'path';
import { partytownVite } from '@builder.io/partytown/utils';

export default defineConfig(() => {
  return {
    plugins: [
      partytownVite({
        dest: join(__dirname, 'dist', '~partytown'),
      }),
    ],
  };
});

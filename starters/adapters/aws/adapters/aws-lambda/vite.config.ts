import { nodeServerAdapter } from '@builder.io/qwik-city/adapters/node-server/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const entryPointWithDot = () => ({
  name: 'rename-entry-point',
  writeBundle() {
    const output = join(process.cwd(), 'server', 'aws.js')
    writeFileSync(output, 'export * from "./entry.aws-lambda.mjs";')
  }
})

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.aws-lambda.tsx', 'src/entry.ssr.tsx', '@qwik-city-plan'],
      },
    },
    plugins: [nodeServerAdapter({ name: 'express' }), entryPointWithDot()],
  };
});

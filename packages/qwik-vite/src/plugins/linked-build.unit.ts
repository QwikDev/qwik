import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { createLinkedBuild } from './linked-build';
import { qwikRolldown } from './rolldown';
import { Q_MANIFEST_FILENAME } from './plugin';
import type { QwikManifest } from '../types';

test('links a library again using consuming application inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const library = join(directory, 'library.tsx');
  const application = join(directory, 'application.tsx');
  await writeFile(
    library,
    `export const Label = props => <p>{props.value}</p>;
    export const Example = () => <Label value="example" />;`
  );
  async function build(entry: string, isLibrary: boolean) {
    const compiler = createLinkedBuild();
    const bundle = await rolldown({
      input: entry,
      external: (id) => id.startsWith('@qwik.dev/core'),
      plugins: [
        {
          name: 'linked-build-test',
          buildStart() {
            return compiler.buildStart(this, {
              entries: [entry],
              rootDir: directory,
              server: false,
              library: isLibrary,
              development: false,
              sourceMaps: false,
              onOutput() {},
            });
          },
          resolveId(id, importer) {
            return compiler.resolveId(this, id, importer);
          },
          load(id) {
            return compiler.load(this, id);
          },
          transform(code, id) {
            return compiler.transform(code, id);
          },
          generateBundle(_, output) {
            compiler.generateBundle(this, output);
          },
        },
      ],
    });
    try {
      return await bundle.write({ dir: join(directory, isLibrary ? 'lib' : 'app'), format: 'es' });
    } finally {
      await bundle.close();
    }
  }
  try {
    const libraryOutput = await build(library, true);
    expect(
      libraryOutput.output
        .filter((file) => file.type === 'chunk')
        .map((file) => file.code)
        .join('\n')
    ).toContain('createContentBlock');
    const artifact = await readFile(join(directory, 'lib/library.js.qwik-plan.json'), 'utf8');
    expect(JSON.parse(artifact).format).toBe('qwik/library-plan');
    await writeFile(
      application,
      `import { Label } from './lib/library.js'; export default () => <Label value="text" />;`
    );
    const textOutput = await build(application, false);
    const textCode = textOutput.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');
    expect(textCode).toContain('createText');
    expect(textCode).not.toContain('createContentBlock');
    await writeFile(
      application,
      `import { Label } from './lib/library.js'; export default () => <Label value={<b />} />;`
    );
    const jsxOutput = await build(application, false);
    const jsxCode = jsxOutput.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');
    expect(jsxCode).toContain('createContentBlock');
    expect(await readFile(join(directory, 'lib/library.js.qwik-plan.json'), 'utf8')).toBe(artifact);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test.each([true, false])(
  'the default client build protects server-only modules (entry: %s)',
  async (isEntry) => {
    const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-server-'));
    const server = join(directory, 'entry.server.ts');
    const entry = isEntry ? server : join(directory, 'entry.ts');
    await writeFile(server, 'export const secret = "server implementation";');
    if (!isEntry) {
      await writeFile(entry, `export { secret } from './entry.server';`);
    }
    try {
      const bundle = await rolldown({
        input: entry,
        external: (id) => id.startsWith('@qwik.dev/core'),
        plugins: [qwikRolldown({ target: 'client', rootDir: directory, srcDir: directory })],
      });
      try {
        await expect(bundle.generate({ format: 'es' })).rejects.toThrow(/Server-only module/);
      } finally {
        await bundle.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);

test('the default plugin publishes neutral plans without an experimental flag', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-default-linked-'));
  const entry = join(directory, 'library.tsx');
  await writeFile(entry, 'export const Label = props => <p>{props.value}</p>;');
  try {
    const bundle = await rolldown({
      input: entry,
      external: (id) => id.startsWith('@qwik.dev/core'),
      plugins: [qwikRolldown({ target: 'lib', rootDir: directory, srcDir: directory })],
    });
    try {
      const output = await bundle.generate({ format: 'es' });
      const artifact = output.output.find(
        (file) => file.type === 'asset' && file.fileName.endsWith('.qwik-plan.json')
      );
      expect(artifact?.type).toBe('asset');
      if (artifact?.type !== 'asset') {
        throw new Error('Missing library plan');
      }
      expect(JSON.parse(String(artifact.source)).format).toBe('qwik/library-plan');
    } finally {
      await bundle.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('linked imports retain the default build-constant resolver', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-constants-'));
  const entry = join(directory, 'entry.ts');
  await writeFile(entry, `export { isServer } from '@qwik.dev/core/build';`);
  try {
    const bundle = await rolldown({
      input: entry,
      external: (id) => id === '@qwik.dev/core',
      plugins: [
        qwikRolldown({
          target: 'client',
          buildMode: 'production',
          rootDir: directory,
          srcDir: directory,
        }),
      ],
    });
    try {
      const output = await bundle.generate({ format: 'es' });
      const code = output.output
        .filter((file) => file.type === 'chunk')
        .map((file) => file.code)
        .join('\n');
      expect(code).toContain('isServer = false');
    } finally {
      await bundle.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('the default client build maps linked text and event QRLs into its manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-manifest-'));
  const entry = join(directory, 'entry.tsx');
  await writeFile(
    entry,
    `import { component$, useSignal } from '@qwik.dev/core';
    const Label = component$(props => <p>{props.value}</p>);
    export default () => { const count = useSignal(0); return <button onClick$={() => count.value++}>
      <Label value={count.value} /></button>; };`
  );
  try {
    const bundle = await rolldown({
      input: entry,
      external: (id) => id === '@qwik.dev/core',
      plugins: [
        qwikRolldown({
          target: 'client',
          buildMode: 'production',
          rootDir: directory,
          srcDir: directory,
        }),
      ],
    });
    try {
      const output = await bundle.generate({ format: 'es' });
      const chunks = output.output.filter((file) => file.type === 'chunk');
      expect(chunks.map((file) => file.code).join('\n')).not.toContain('createContentBlock');
      const artifact = output.output.find(
        (file) => file.type === 'asset' && file.fileName === Q_MANIFEST_FILENAME
      );
      if (artifact?.type !== 'asset') {
        throw new Error('Missing client manifest');
      }
      const manifest: QwikManifest = JSON.parse(String(artifact.source));
      expect(
        Object.values(manifest.symbols)
          .map((symbol) => symbol.ctxName)
          .sort()
      ).toEqual(['onClick$', 'text']);
      expect(Object.keys(manifest.mapping).sort()).toEqual(Object.keys(manifest.symbols).sort());
      for (const file of Object.values(manifest.mapping)) {
        expect(chunks.some((chunk) => chunk.fileName === join('build', String(file)))).toBe(true);
      }
    } finally {
      await bundle.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test.each([
  'export const onGet = () => "server implementation";',
  `import { server$ } from '@qwik.dev/router'; export const load = server$(() => "server implementation");`,
])(
  'does not emit server implementations before pipeline stripping is supported: %s',
  async (code) => {
    const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-policy-'));
    const entry = join(directory, 'entry.ts');
    await writeFile(entry, code);
    try {
      const bundle = await rolldown({
        input: entry,
        external: (id) => id === '@qwik.dev/core' || id === '@qwik.dev/router',
        plugins: [qwikRolldown({ target: 'client', rootDir: directory, srcDir: directory })],
      });
      try {
        await expect(bundle.generate({ format: 'es' })).rejects.toThrow(
          /requires server-only stripping/
        );
      } finally {
        await bundle.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);

test.each([false, true])(
  'links type dependencies while enforcing runtime boundaries: runtime=%s',
  async (isRuntime) => {
    const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-types-'));
    const entry = join(directory, 'application.tsx');
    await writeFile(
      entry,
      `import type { Input } from './types';
    ${isRuntime ? "import './definition';" : ''}
    export default (props: Input) => <p>{props.value}</p>;`
    );
    await writeFile(join(directory, 'types.ts'), `export type { Input } from './definition';`);
    await writeFile(
      join(directory, 'definition.ts'),
      `interface Box<T> {value: T}
    export type Input = Box<string>;
    export const onGet = () => 'type-only dependency executed';`
    );
    try {
      const bundle = await rolldown({
        input: entry,
        external: (id) => id === '@qwik.dev/core',
        plugins: [
          qwikRolldown({
            target: 'client',
            buildMode: 'production',
            rootDir: directory,
            srcDir: directory,
          }),
        ],
      });
      try {
        if (isRuntime) {
          await expect(bundle.generate({ format: 'es' })).rejects.toThrow(
            /requires server-only stripping/
          );
          return;
        }
        const output = await bundle.generate({ format: 'es' });
        const code = output.output
          .filter((file) => file.type === 'chunk')
          .map((file) => file.code)
          .join('\n');
        expect(code).toContain('createText');
        expect(code).not.toContain('createContentBlock');
        expect(code).not.toContain('type-only dependency executed');
      } finally {
        await bundle.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);

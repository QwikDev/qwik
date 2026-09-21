import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { createLinkedBuild } from './linked-build';
import { qwikRolldown } from './rolldown';
import type { Rolldown } from 'vite';
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
    const Label = component$(props => <p>{props.value + '!'}</p>);
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
      // Components map by their hashed export too, so a serialized component resolves its bundle.
      const componentSymbols = Object.keys(manifest.mapping).filter((symbol) =>
        /_component_\w+$/.test(symbol)
      );
      expect(componentSymbols).toHaveLength(2);
      expect(Object.keys(manifest.mapping).sort()).toEqual(
        [...Object.keys(manifest.symbols), ...componentSymbols].sort()
      );
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

test('re-resolves an import the library left external when the application provides it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const library = join(directory, 'library.tsx');
  const route = join(directory, 'route.tsx');
  const application = join(directory, 'application.tsx');
  await writeFile(
    library,
    `import { routes } from '@app-routes';
    export const Example = () => <p>{routes.length}</p>;`
  );
  await writeFile(route, `export default () => <b>route-marker-text</b>;`);
  await writeFile(
    application,
    `import { Example } from './lib/library.js'; export default () => <Example />;`
  );
  // the library cannot know the application's route table; the application generates it
  const routeTable = {
    name: 'route-table',
    resolveId: (id: string) => (id === '@app-routes' ? id : null),
    load: (id: string) =>
      id === '@app-routes'
        ? `export const routes = [() => import(${JSON.stringify(route)})];`
        : null,
  };
  async function build(entry: string, isLibrary: boolean) {
    const compiler = createLinkedBuild();
    const bundle = await rolldown({
      input: entry,
      external: (id) => id.startsWith('@qwik.dev/core') || (isLibrary && id === '@app-routes'),
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
        ...(isLibrary ? [] : [routeTable]),
      ],
    });
    try {
      return await bundle.write({ dir: join(directory, isLibrary ? 'lib' : 'app'), format: 'es' });
    } finally {
      await bundle.close();
    }
  }
  try {
    await build(library, true);
    const output = await build(application, false);
    const code = output.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');

    // the route reached through the generated table is linked, not left for the bundler to guess
    expect(code).toContain('route-marker-text');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('leaves a \\0 virtual module to its plugin, even one that loads linked modules itself', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const route = join(directory, 'route.tsx');
  const application = join(directory, 'application.tsx');
  await writeFile(route, `export default () => <b>route-marker-text</b>;`);
  await writeFile(
    application,
    `import 'virtual:collect'; import Route from './route'; export default () => <Route />;`
  );
  // the router's server-fns module reads every route's linked code while it is being loaded
  const collector = {
    name: 'collector',
    resolveId: (id: string) => (id === 'virtual:collect' ? '\0virtual:collect' : null),
    async load(this: Rolldown.PluginContext, id: string) {
      if (id !== '\0virtual:collect') {
        return null;
      }
      const info = await this.load({ id: route, resolveDependencies: true });
      // follow the linked module the route's stub re-exports, as the server-fns walk does
      const linked = await Promise.all(
        info.importedIds.map((id) => this.load({ id, resolveDependencies: true }))
      );
      return `export const collected = ${JSON.stringify(linked.map((module) => module.id))};`;
    },
  };
  const compiler = createLinkedBuild();
  const bundle = await rolldown({
    input: [application],
    external: (id) => id.startsWith('@qwik.dev/core'),
    plugins: [
      {
        name: 'linked-build-test',
        buildStart() {
          return compiler.buildStart(this, {
            entries: [application],
            rootDir: directory,
            server: true,
            library: false,
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
      },
      collector,
    ],
  });
  try {
    const output = await bundle.write({ dir: join(directory, 'app'), format: 'es' });
    const code = output.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');
    expect(code).toContain('qwik-linked:');
  } finally {
    await bundle.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('links an entry a plugin provides under an extension-less virtual id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const label = join(directory, 'label.tsx');
  await writeFile(label, `export const Label = () => <b>virtual-entry-marker</b>;`);
  const entry = '@app-entry';
  const virtualEntry = {
    name: 'virtual-entry',
    resolveId: (id: string) => (id === entry ? entry : null),
    load: (id: string) =>
      id === entry
        ? `import { Label } from ${JSON.stringify(label)}; export const render = () => Label;`
        : null,
  };
  const compiler = createLinkedBuild();
  const bundle = await rolldown({
    input: [entry],
    external: (id) => id.startsWith('@qwik.dev/core'),
    plugins: [
      {
        name: 'linked-build-test',
        buildStart() {
          return compiler.buildStart(this, {
            entries: [entry],
            rootDir: directory,
            server: false,
            library: false,
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
      },
      virtualEntry,
    ],
  });
  try {
    const output = await bundle.write({ dir: join(directory, 'app'), format: 'es' });
    const code = output.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');
    expect(code).toContain('virtual-entry-marker');
  } finally {
    await bundle.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('links a module two library bundles both carry only once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const shared = join(directory, 'shared.tsx');
  const first = join(directory, 'first.tsx');
  const second = join(directory, 'second.tsx');
  const application = join(directory, 'application.tsx');
  await writeFile(
    shared,
    `export const Shared = (props: { value: string }) => <button onClick$={() => console.log('shared-marker')}>{props.value}</button>;`
  );
  await writeFile(first, `export { Shared as First } from './shared';`);
  await writeFile(second, `export { Shared as Second } from './shared';`);
  await writeFile(
    application,
    `import { First } from './lib/first.js'; import { Second } from './lib/second.js';
    export default () => <><First value="a" /><Second value="b" /></>;`
  );
  const segments: string[] = [];
  async function build(entries: string[], isLibrary: boolean) {
    const compiler = createLinkedBuild();
    const bundle = await rolldown({
      input: entries,
      external: (id) => id.startsWith('@qwik.dev/core'),
      plugins: [
        {
          name: 'linked-build-test',
          buildStart() {
            return compiler.buildStart(this, {
              entries,
              rootDir: directory,
              server: false,
              library: isLibrary,
              development: false,
              sourceMaps: false,
              onOutput(output) {
                if (!isLibrary) {
                  segments.push(
                    ...output.modules.flatMap((m) => (m.segment ? [m.segment.name] : []))
                  );
                }
              },
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
    await build([first, second], true);
    await build([application], false);
    const sharedSegments = segments.filter((name) => name.startsWith('shared_'));
    // both plans carry shared.tsx; the application links it once, so its segment has one owner
    expect(sharedSegments.length).toBeGreaterThan(0);
    expect(new Set(sharedSegments).size).toBe(sharedSegments.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

test('links a generated JSX module whose id carries a query, as image ?jsx imports do', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-linked-'));
  const application = join(directory, 'application.tsx');
  await writeFile(
    application,
    `import Img from './photo.png?jsx'; export default () => <div><Img alt="x" /></div>;`
  );
  const generatedId = `virtual:${join(directory, 'photo.png.h4sh.qwik.jsx')}?jsx=&w=100`;
  const imageJsx = {
    name: 'image-jsx-test',
    resolveId: (id: string) => (id.endsWith('photo.png?jsx') ? generatedId : null),
    load: (id: string) =>
      id === generatedId
        ? `export const QwikImg = (p) => <img decoding="async" {...p} width={100} />; export default QwikImg;`
        : null,
  };
  const compiler = createLinkedBuild();
  const bundle = await rolldown({
    input: application,
    external: (id) => id.startsWith('@qwik.dev/core'),
    plugins: [
      {
        name: 'linked-build-test',
        buildStart() {
          return compiler.buildStart(this, {
            entries: [application],
            rootDir: directory,
            server: false,
            library: false,
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
      },
      imageJsx,
    ],
  });
  try {
    const output = await bundle.write({ dir: join(directory, 'app'), format: 'es' });
    const code = output.output
      .filter((file) => file.type === 'chunk')
      .map((file) => file.code)
      .join('\n');

    // the generated module is compiled like any authored one: its JSX lowers, nothing is left to guess
    expect(code).toContain('decoding');
    expect(code).not.toContain('jsx(');
  } finally {
    await bundle.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

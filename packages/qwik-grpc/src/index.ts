import { type Plugin } from 'vite';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface QwikGrpcOptions {
  // Path to folder of .proto files. Defaults to ./proto
  protoPath?: string;

  // Path to generate Connect clients. Default to "src/.qwik-grpc"
  outDir?: string;

  // Pass any flags to the `buf generate` command. eg: "--debug --version"
  bufFlags?: string;

  // Cleans the generated files before regenerating. Use this in place of the buf.build flag --clean.
  // Default: true
  clean?: boolean;
}

interface Service {
  // Foo
  name: string;

  // foo
  instanceName: string;

  // FooService
  serviceName: string;

  // outDir/foo/v1/foo_pb.ts
  path: string;
}

// Returns a default buf.gen.yaml file
function defaultBufGenYaml(outDir: string): string {
  return `
version: v2
plugins:
  - local: protoc-gen-es
    include_imports: true
    opt: target=ts
    out: ${outDir}
`;
}

// Locate a buf.gen template, preferring project root, then proto folder.
function findBufGenTemplate(protoPath: string, outDir: string): string {
  const candidates = ['buf.gen.yaml', 'buf.gen.yml', 'buf.gen.json'].flatMap((name) => [
    path.join(process.cwd(), name),
    path.join(protoPath, name),
  ]);

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      console.log(`[qwikGrpc] Using ${path.relative(process.cwd(), file)}`);
      return fs.readFileSync(file, 'utf8');
    }
  }

  return defaultBufGenYaml(outDir);
}

// Run buf generate and return all generated *_pb.ts files.
function runBufGenerate(protoPath: string, outDir: string, flags: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const bufGenContent = findBufGenTemplate(protoPath, outDir);

  // Save the template temporarily (buf CLI doesn’t support inline YAML well)
  const tmpPath = path.join(outDir, 'buf.gen.tmp.yaml');
  fs.writeFileSync(tmpPath, bufGenContent, 'utf8');

  try {
    execSync(`buf generate ${protoPath} --template ${tmpPath} ${flags}`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[qwikGrpc] buf generate failed:', err);
    throw err;
  } finally {
    fs.unlinkSync(tmpPath);
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith('_pb.ts')) files.push(full);
    }
  };
  walk(outDir);

  return files;
}

// Creates a list of Services by reading the generated clients
function getServices(outDir: string, files: string[]): Service[] {
  return files
    .map((filePath) => {
      const fileContent = fs.readFileSync(filePath, 'utf8');

      // Match pattern: export const FooService: GenService<...
      const match = fileContent.match(/export\s+const\s+(\w+)Service\s*:\s*GenService\s*</);
      if (!match) {
        console.warn(`[qwikGrpc] No service export found in ${filePath}`);
        return null;
      }

      const name = match[1]; // e.g. "Foo"
      const instanceName = name[0].toLowerCase() + name.slice(1); // e.g. "foo"
      const serviceName = `${name}Service`; // e.g. "FooService"
      const relPath =
        './' + path.relative(outDir, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');

      return { serviceName, name, instanceName, path: relPath };
    })
    .filter((s): s is Service => !!s);
}

// Generates the client.ts file which registers the clients
function generateClientsFile(outDir: string, services: Service[]) {
  const imports = [
    `import { RequestEventBase } from "@builder.io/qwik-city";`,
    `import { createClient, Transport, Client } from "@connectrpc/connect";`,
    ...services.map((s, i) => {
      return `import { ${s.serviceName} } from '${s.path}';`;
    }),
  ].join('\n');

  const interfaces = `
    interface GrpcClients {
      ${services.map((s, i) => `${s.instanceName}: Client<typeof ${s.serviceName}>`).join('\n')}
    }
  `;
  const factory = `
    export function registerGrpcClients(transport: Transport, ev: RequestEventBase) {
      ev.sharedMap.set('qwik-grpc-clients', {
        ${services.map((s, i) => `${s.instanceName}: createClient(${s.serviceName}, transport)`).join(',\n')}
      })
    }
  `;

  const getter = `
    export function grpc(ev: RequestEventBase): GrpcClients {
      return ev.sharedMap.get('qwik-grpc-clients')
    }
  `;

  const data = `
    ${imports}
    ${factory}
    ${interfaces}
    ${getter}
  `;

  fs.writeFileSync(path.join(outDir, 'clients.ts'), data, 'utf8');
}

export function qwikGrpc(options?: QwikGrpcOptions): Plugin {
  const {
    protoPath = 'proto',
    outDir = 'src/.qwik-grpc',
    bufFlags = '',
    clean = true,
  } = options || {};

  let isFirstBuild = true;

  function generate() {
    if (clean) {
      fs.rmdirSync(outDir, { recursive: true });
    }

    const generatedFiles = runBufGenerate(protoPath, outDir, bufFlags);
    const services = getServices(outDir, generatedFiles);
    generateClientsFile(outDir, services);
  }

  return {
    name: 'vite-plugin-qwik-grpc',
    enforce: 'pre',

    buildStart() {
      if (isFirstBuild) {
        isFirstBuild = false;
        generate();
      }
    },

    configureServer(server) {
      let regenTimer: NodeJS.Timeout | null = null;

      // Watch the entire proto directory recursively
      server.watcher.add(protoPath);

      // React to any changes inside it
      server.watcher.on('all', (event, file) => {
        // Don't generate if the file isn't a .proto file
        if (!file.endsWith('.proto')) {
          return;
        }

        // Don't generate if the file isn't in the outDir
        if (file.startsWith(outDir) || file.includes(outDir)) {
          return;
        }

        if (['add', 'change', 'unlink'].includes(event)) {
          // Debounce to avoide unecessary rebuilds
          if (regenTimer) {
            clearTimeout(regenTimer);
          }

          regenTimer = setTimeout(() => {
            generate();
            server.ws.send({ type: 'full-reload' });
          }, 100);
        }
      });
    },
  };
}

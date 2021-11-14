/* eslint no-console: ["off"] */
import type { Request, Response, RequestHandler, NextFunction } from 'express';
import express from 'express';
import { readFile } from 'fs/promises';
import mri from 'mri';
import { join } from 'path';
import srcMap from 'source-map-support';

srcMap.install();

// https://regexr.com/69fs7
const QRL_MATCHER = /="(.\/)?(([\w\d-_.]+)#([\w\d_]+))[\?"]/g;

const symbolManifest = new Map<string, string>();

async function startServer() {
  const args = mri(process.argv.slice(2), {
    default: { port: 8080, mode: 'development' },
  });

  const rootDir = join(__dirname, 'src');
  const esmDir = join(__dirname, 'output', 'esm');
  const mode = args.mode === 'production' ? 'production' : 'development';

  console.log('====================================================');
  console.log(`Integration Server`);
  console.log(`Mode:                ${mode}`);
  console.log(`Server root dir:     ${rootDir}`);
  console.log(`            ESM:     ${esmDir}`);
  console.log(`Server:              http://localhost:${args.port}/`);
  console.log(``);

  await readQrlMapper();

  const app = express();
  app.get('/qwikloader.debug.js', streamFile('qwikloader.debug.js'));
  app.get('/prefetch.debug.js', streamFile('prefetch.debug.js'));
  app.get('/qwikloader.js', streamFile('qwikloader.js'));
  app.get('/prefetch.js', streamFile('prefetch.js'));
  app.use(
    express.static(rootDir, {
      maxAge: 60 * 60 * 1000,
    })
  );
  //app.use(express.static(esmDir));
  app.use(chunkWithSize(esmDir));
  app.get('/', renderIndexHTML);
  app.listen(args.port);
}

async function renderIndexHTML(req: Request, res: Response) {
  const renderFn = (await import('./output/cjs/index.server.qwik.js' as any)).default;
  const response = await renderFn({
    outDir: './',
    qrlMapper: qrlMapper,
  });
  let html = response.html as string;
  html = html.replace(
    QRL_MATCHER,
    (_, prefix, qrl, module, symbol) => `="${qrlMapper(module, symbol)}"`
  );
  res.write(html);
  res.write(SCRIPT_addSrcSize);
  res.end();
}

function streamFile(fileName: string) {
  return async (req: Request, res: Response) => {
    res.type('application/javascript');
    const content = await readFile(join('dist-dev', '@builder.io-qwik', fileName));
    res.send(content);
  };
}

function qrlMapper(module: string, symbol: string): string {
  const browserModule = symbolManifest.get(symbol)!;
  const browserQRL = `./${browserModule}#${symbol}`;
  return browserQRL;
}

async function readQrlMapper() {
  const qEntryMap = JSON.parse(String(await readFile('./output/esm/q-entry-map.json')));
  for (const key in qEntryMap.mapping) {
    if (Object.prototype.hasOwnProperty.call(qEntryMap.mapping, key)) {
      const value = qEntryMap.mapping[key];
      const chunkName = value.substr(0, value.length - 3);
      const symbol = key.split('h_components_')[1]!;
      symbolManifest.set(symbol, chunkName);
    }
  }
}

startServer();

function chunkWithSize(esmDir: string): any {
  return async function (req: Request, res: Response, next: NextFunction) {
    console.log(req.path);
    if (req.path.endsWith('.js')) {
      const content = await readFile(join(esmDir, req.path));
      res.setHeader('content-type', 'text/javascript; charset=UTF-8');
      res.write(content);
      res.write(`;typeof __addSrcSize === 'function' && __addSrcSize(${content.length});`);
      res.end();
    } else {
      next();
    }
  };
}

const SCRIPT_addSrcSize = `<script>
  window.__addSrcSize = (function() {
    const box = document.createElement('div');
    const bar = document.createElement('div');
    const text = document.createElement('span')
    box.appendChild(bar);
    box.appendChild(text);
    document.body.appendChild(box);
    
    box.style = "position: absolute; height: 2em; width: 100%; left: 0; bottom: 0; padding: 2px; background-color: white;"
    bar.style = "height: 1.8em; position: absolute; background-color: blue; border: solid 2px lightblue;";
    text.style = "position: absolute; font-weight: bold; padding: .4em; right: 0; ";
    let currentSize = 0;
  
    function addSrcSize(size) {
      currentSize += size;
      text.textContent = Number(currentSize).toLocaleString() + " bytes";
      bar.style.width = (currentSize / 500) + 'px';
    }
    addSrcSize(900); // for qwikloader  
    return addSrcSize;
  })();
</script>`;

import { BMP } from 'image-size/types/bmp';
import { CUR } from 'image-size/types/cur';
import { DDS } from 'image-size/types/dds';
import { GIF } from 'image-size/types/gif';
import { HEIF } from 'image-size/types/heif';
import { ICNS } from 'image-size/types/icns';
import { ICO } from 'image-size/types/ico';
import { J2C } from 'image-size/types/j2c';
import { JP2 } from 'image-size/types/jp2';
import { JPG } from 'image-size/types/jpg';
import { KTX } from 'image-size/types/ktx';
import { PNG } from 'image-size/types/png';
import { PNM } from 'image-size/types/pnm';
import { PSD } from 'image-size/types/psd';
import { SVG } from 'image-size/types/svg';
import { TGA } from 'image-size/types/tga';
import { WEBP } from 'image-size/types/webp';

import type { Connect } from 'vite';
import type { OptimizerSystem } from '../../types';
import { formatError } from '../format-error';

// This map helps avoid validating for every single image type
const firstBytes: Record<number, keyof typeof types> = {
  0x38: 'psd',
  0x42: 'bmp',
  0x44: 'dds',
  0x47: 'gif',
  0x52: 'webp',
  0x69: 'icns',
  0x89: 'png',
  0xff: 'jpg',
};

// Put in order of most common to least common
const types = {
  webp: WEBP,
  jpg: JPG,
  png: PNG,
  svg: SVG,
  gif: GIF,
  avif: HEIF,
  bmp: BMP,
  cur: CUR,
  dds: DDS,
  icns: ICNS,
  ico: ICO,
  j2c: J2C,
  jp2: JP2,
  ktx: KTX,
  pnm: PNM,
  psd: PSD,
  tga: TGA,
};

const keys = Object.keys(types) as (keyof typeof types)[];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

type ResolveHostname = (hostname: string) => Promise<string[]>;
type RequestUrl = (url: URL, address: string) => Promise<Response>;

interface ImageFetchOptions {
  resolveHostname?: ResolveHostname;
  requestUrl?: RequestUrl;
  addressPolicy?: AddressPolicy;
  localAddress?: string;
  localPort?: number;
}

interface AddressPolicy {
  isIp(address: string): boolean;
  isBlocked(address: string): boolean;
  isLoopback(address: string): boolean;
  areSame(left: string, right: string): boolean;
}

function detector(buffer: Buffer): keyof typeof types | undefined {
  const byte = buffer[0];
  const type = firstBytes[byte];
  if (type && types[type].validate(buffer)) {
    return type;
  }
  return keys.find((key) => types[key].validate(buffer));
}

function lookup(buffer: Buffer) {
  // detect the file type, don't rely on the extension
  const type = detector(buffer);
  if (typeof type !== 'undefined') {
    // find an appropriate handler for this file type
    const size = types[type].calculate(buffer);
    if (size !== undefined) {
      size.type = type;
      return size;
    }
  }
}
export async function getInfoForSrc(src: string, options: ImageFetchOptions = {}) {
  try {
    let imageUrl = new URL(src);
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const addresses = await resolveAllowedAddresses(imageUrl, options);
      if (!addresses) {
        return undefined;
      }
      const res = options.requestUrl
        ? await options.requestUrl(imageUrl, addresses[0])
        : await fetch(imageUrl, {
            headers: { Accept: 'image/*,*/*' },
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          });
      if (isRedirect(res.status)) {
        const location = res.headers.get('Location');
        await res.body?.cancel();
        if (!location || redirectCount === MAX_REDIRECTS) {
          return undefined;
        }
        imageUrl = new URL(location, imageUrl);
        continue;
      }
      if (!res.ok) {
        return undefined;
      }
      const buffer = await readBoundedBody(res);
      if (!buffer) {
        return undefined;
      }
      const size = lookup(buffer);
      if (size) {
        return {
          width: size.width,
          height: size.height,
          type: size.type,
          size: buffer.byteLength,
        };
      }
      return undefined;
    }
  } catch {
    return undefined;
  }
}

async function resolveAllowedAddresses(
  url: URL,
  options: ImageFetchOptions
): Promise<string[] | undefined> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return undefined;
  }
  const addressPolicy = options.addressPolicy;
  if (!addressPolicy) {
    return undefined;
  }
  const hostname = normalizeAddress(url.hostname);
  const addresses = addressPolicy.isIp(hostname)
    ? [hostname]
    : await options.resolveHostname?.(hostname);
  if (!addresses?.length) {
    return undefined;
  }
  if (addresses.every((address) => !addressPolicy.isBlocked(address))) {
    return addresses;
  }
  return isLocalDevServerUrl(url, addresses, options)
    ? [normalizeAddress(options.localAddress!)]
    : undefined;
}

function isLocalDevServerUrl(url: URL, addresses: string[], options: ImageFetchOptions): boolean {
  const { localAddress, localPort } = options;
  if (!localAddress || !localPort || getUrlPort(url) !== localPort) {
    return false;
  }
  const addressPolicy = options.addressPolicy;
  if (!addressPolicy) {
    return false;
  }
  if (addresses.every((address) => addressPolicy.areSame(address, localAddress))) {
    return true;
  }
  return (
    url.hostname === 'localhost' &&
    addressPolicy.isLoopback(localAddress) &&
    addresses.every(addressPolicy.isLoopback)
  );
}

function normalizeAddress(address: string): string {
  const normalized = address
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) {
    return mappedIpv4;
  }
  try {
    return normalized.includes(':')
      ? new URL(`http://[${normalized}]/`).hostname.slice(1, -1)
      : normalized;
  } catch {
    return normalized;
  }
}

function getUrlPort(url: URL): number {
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function readBoundedBody(response: Response): Promise<Buffer | undefined> {
  const contentLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let byteLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks, byteLength);
    }
    byteLength += value.byteLength;
    if (byteLength > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
}

export function createAddressPolicy({
  BlockList,
  isIP,
}: Pick<typeof import('node:net'), 'BlockList' | 'isIP'>): AddressPolicy {
  const blocked = new BlockList();
  const loopback = new BlockList();
  for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const) {
    blocked.addSubnet(network, prefix, 'ipv4');
  }
  for (const [network, prefix] of [
    ['::', 96],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ] as const) {
    blocked.addSubnet(network, prefix, 'ipv6');
  }
  loopback.addSubnet('127.0.0.0', 8, 'ipv4');
  loopback.addAddress('::1', 'ipv6');

  const check = (list: InstanceType<typeof BlockList>, address: string) => {
    const normalized = normalizeAddress(address);
    const family = isIP(normalized);
    return family !== 0 && list.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
  };
  return {
    isIp: (address) => isIP(normalizeAddress(address)) !== 0,
    isBlocked: (address) => !isIP(normalizeAddress(address)) || check(blocked, address),
    isLoopback: (address) => check(loopback, address),
    areSame: (left, right) => normalizeAddress(left) === normalizeAddress(right),
  };
}

function requestPinnedImage(
  url: URL,
  address: string,
  http: typeof import('node:http'),
  https: typeof import('node:https')
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestOptions: import('node:https').RequestOptions = {
      protocol: url.protocol,
      hostname: normalizeAddress(address),
      port: getUrlPort(url),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { Accept: 'image/*,*/*', Host: url.host },
      servername:
        url.hostname.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
          ? undefined
          : url.hostname,
    };
    const onResponse = (response: import('node:http').IncomingMessage) => {
      response.on('close', () => clearTimeout(timeout));
      response.on('end', () => clearTimeout(timeout));
      const headers = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) {
        headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          response.on('data', (chunk: Uint8Array) => controller.enqueue(chunk));
          response.on('end', () => controller.close());
          response.on('error', (error) => controller.error(error));
        },
        cancel() {
          response.destroy();
        },
      });
      resolve(
        new Response(body, {
          status: response.statusCode,
          statusText: response.statusMessage,
          headers,
        })
      );
    };
    const request =
      url.protocol === 'https:'
        ? https.request(requestOptions, onResponse)
        : http.request(requestOptions, onResponse);
    const timeout = setTimeout(() => request.destroy(new Error('Image request timed out')), 10_000);
    request.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request.end();
  });
}

export const getImageSizeServer = (
  sys: OptimizerSystem,
  rootDir: string,
  srcDir: string
): Connect.NextHandleFunction => {
  const dnsPromise: Promise<typeof import('node:dns/promises')> =
    sys.dynamicImport('node:dns/promises');
  const addressPolicyPromise: Promise<AddressPolicy> = sys
    .dynamicImport('node:net')
    .then(createAddressPolicy);
  const httpPromise: Promise<typeof import('node:http')> = sys.dynamicImport('node:http');
  const httpsPromise: Promise<typeof import('node:https')> = sys.dynamicImport('node:https');
  return async (req, res, next) => {
    try {
      const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
      const path: typeof import('path') = await sys.dynamicImport('node:path');
      const dns = await dnsPromise;
      const addressPolicy = await addressPolicyPromise;
      const http = await httpPromise;
      const https = await httpsPromise;

      let url;
      try {
        url = new URL(req.url!, 'http://localhost:3000/');
      } catch {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/__image_info') {
        const imageURL = url.searchParams.get('url');
        res.setHeader('content-type', 'application/json');
        if (imageURL) {
          const info = await getInfoForSrc(imageURL, {
            localAddress: req.socket.localAddress,
            localPort: req.socket.localPort,
            addressPolicy,
            resolveHostname: async (hostname) =>
              (await dns.lookup(hostname, { all: true, verbatim: true })).map(
                ({ address }) => address
              ),
            requestUrl: (url, address) => requestPinnedImage(url, address, http, https),
          });
          res.setHeader('cache-control', 'public, max-age=31536000, immutable');
          if (!info) {
            res.statusCode = 404;
          } else {
            res.write(JSON.stringify(info));
          }
        } else {
          res.statusCode = 500;
          const info = { message: 'error' };
          res.write(JSON.stringify(info));
        }
        res.end();
        return;
      } else if (req.method === 'POST' && url.pathname === '/__image_fix') {
        const loc = url.searchParams.get('loc') as string;
        const width = url.searchParams.get('width');
        const height = url.searchParams.get('height');
        const src = url.searchParams.get('src') as string;
        const currentHref = url.searchParams.get('currentHref') as string;

        const locParts = loc.split(':');
        const column = parseInt(locParts[locParts.length - 1], 10) - 1;
        let line = parseInt(locParts[locParts.length - 2], 10) - 1;
        const filePath = path.resolve(srcDir, locParts.slice(0, locParts.length - 2).join(':'));
        const extension = path.extname(filePath).toLowerCase();
        const buffer = fs.readFileSync(filePath);
        let text = buffer.toString('utf-8');

        let offset = 0;
        for (; offset < text.length; offset++) {
          if (line === 0) {
            offset += column;
            break;
          } else if (text[offset] === '\n') {
            line--;
            continue;
          }
        }

        if (text.slice(offset, offset + 4) !== '<img') {
          console.error(
            'Could not apply auto fix, because it was not possible to find the original <img> tag'
          );
          res.statusCode = 500;
          return;
        }

        const end = text.indexOf('>', offset) + 1;
        if (end < offset) {
          console.error(
            'Could not apply auto fix, because it was not possible to find the original <img> tag'
          );
          res.statusCode = 500;
          return;
        }

        const extensionSupportsImport = ['.ts', '.tsx', '.js', '.jsx', '.mdx'].includes(extension);
        let imgTag = text.slice(offset, end);
        if (src && currentHref && extensionSupportsImport) {
          const urlSrc = new URL(src);
          const urlCurrent = new URL(currentHref);
          if (urlSrc.origin === urlCurrent.origin) {
            const publicImagePath = path.join(rootDir, 'public', urlSrc.pathname);
            const rootImagePath = path.join(rootDir, urlSrc.pathname);
            let relativeLocation: string;
            if (fs.existsSync(publicImagePath)) {
              const mediaSrc = path.join(srcDir, 'media', path.dirname(urlSrc.pathname));
              await fs.promises.mkdir(mediaSrc, { recursive: true });
              await fs.promises.copyFile(
                publicImagePath,
                path.join(srcDir, 'media', urlSrc.pathname)
              );
              relativeLocation = '~/media' + urlSrc.pathname;
            } else if (fs.existsSync(rootImagePath)) {
              relativeLocation = urlSrc.pathname.replace('/src/', '~/');
            } else {
              return;
            }
            const importIdent = imgImportName(urlSrc.pathname);
            const importSrc = `${relativeLocation}?jsx`;
            imgTag = imgTag.replace(/^<img/, `<${importIdent}`);
            imgTag = imgTag.replace(/\bwidth=(({[^}]*})|('[^']*')|("[^"]*"))\s*/, ``);
            imgTag = imgTag.replace(/\bheight=(({[^}]*})|('[^']*')|("[^"]*"))\s*/, ``);
            imgTag = imgTag.replace(/\bsrc=(({[^}]*})|('[^']*')|("[^"]*"))\s*/, ``);

            let insertImport = 0;
            if (extension === '.mdx' && text.startsWith('---')) {
              insertImport = text.indexOf('---', 4) + 3;
              if (insertImport === -1) {
                return;
              }
            }
            const newImport = `\nimport ${importIdent} from '${importSrc}';`;
            text = `${text.slice(0, insertImport)}${newImport}${text.slice(
              insertImport,
              offset
            )}${imgTag}${text.slice(end)}`;
            fs.writeFileSync(filePath, text);
            return;
          }
        }

        imgTag = imgTag.replace(/\bwidth=(({[^}]*})|('[^']*')|("[^"]*"))/, `width="${width}"`);
        imgTag = imgTag.replace(/\bheight=(({[^}]*})|('[^']*')|("[^"]*"))/, `height="${height}"`);
        if (!imgTag.includes('height=')) {
          imgTag = imgTag.replace(/<img/, `<img height="${height}"`);
        }
        if (!imgTag.includes('width=')) {
          imgTag = imgTag.replace(/<img/, `<img width="${width}"`);
        }
        text = text.slice(0, offset) + imgTag + text.slice(end);
        fs.writeFileSync(filePath, text);
      } else {
        next();
      }
    } catch (e) {
      if (e instanceof Error) {
        await formatError(sys, e);
      }
      next(e);
    }
  };
};

function imgImportName(value: string) {
  const dot = value.lastIndexOf('.');
  const slash = value.lastIndexOf('/');
  value = value.substring(slash + 1, dot);
  return `Img${toPascalCase(value)}`;
}

function toPascalCase(string: string) {
  return `${string}`
    .toLowerCase()
    .replace(new RegExp(/[-_]+/, 'g'), ' ')
    .replace(new RegExp(/[^\w\s]/, 'g'), '')
    .replace(new RegExp(/\s+(.)(\w*)/, 'g'), ($1, $2, $3) => `${$2.toUpperCase() + $3}`)
    .replace(new RegExp(/\w/), (s) => s.toUpperCase());
}

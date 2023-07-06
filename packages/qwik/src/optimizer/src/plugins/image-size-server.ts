import bmp_1 from 'image-size/dist/types/bmp.js';
import cur_1 from 'image-size/dist/types/cur.js';
import dds_1 from 'image-size/dist/types/dds.js';
import gif_1 from 'image-size/dist/types/gif.js';
import icns_1 from 'image-size/dist/types/icns.js';
import ico_1 from 'image-size/dist/types/ico.js';
import j2c_1 from 'image-size/dist/types/j2c.js';
import jp2_1 from 'image-size/dist/types/jp2.js';
import jpg_1 from 'image-size/dist/types/jpg.js';
import ktx_1 from 'image-size/dist/types/ktx.js';
import png_1 from 'image-size/dist/types/png.js';
import pnm_1 from 'image-size/dist/types/pnm.js';
import psd_1 from 'image-size/dist/types/psd.js';
import svg_1 from 'image-size/dist/types/svg.js';
import tga_1 from 'image-size/dist/types/tga.js';
import webp_1 from 'image-size/dist/types/webp.js';

import type { Connect } from 'vite';
import type { OptimizerSystem } from '../types';

// This map helps avoid validating for every single image type
const firstBytes = {
  0x38: 'psd',
  0x42: 'bmp',
  0x44: 'dds',
  0x47: 'gif',
  0x49: 'tiff',
  0x4d: 'tiff',
  0x52: 'webp',
  0x69: 'icns',
  0x89: 'png',
  0xff: 'jpg',
};

const types = {
  bmp: bmp_1.BMP,
  cur: cur_1.CUR,
  dds: dds_1.DDS,
  gif: gif_1.GIF,
  icns: icns_1.ICNS,
  ico: ico_1.ICO,
  j2c: j2c_1.J2C,
  jp2: jp2_1.JP2,
  jpg: jpg_1.JPG,
  ktx: ktx_1.KTX,
  png: png_1.PNG,
  pnm: pnm_1.PNM,
  psd: psd_1.PSD,
  svg: svg_1.SVG,
  tga: tga_1.TGA,
  webp: webp_1.WEBP,
};

const keys = Object.keys(types);

function detector(buffer: Buffer) {
  const byte = buffer[0];
  if (byte in firstBytes) {
    const type = (firstBytes as any)[byte];
    if (type && (types as any)[type].validate(buffer)) {
      return type;
    }
  }
  const finder = (key: string) => (types as any)[key].validate(buffer);
  return keys.find(finder);
}

function lookup(buffer: Buffer) {
  // detect the file type.. don't rely on the extension
  const type = detector(buffer);
  if (typeof type !== 'undefined') {
    // find an appropriate handler for this file type
    if (type in types) {
      const size = (types as any)[type].calculate(buffer);
      if (size !== undefined) {
        size.type = type;
        return size;
      }
    }
  }
  // throw up, if we don't understand the file
  throw new TypeError('unsupported file type: ' + type);
}
export async function getInfoForSrc(src: string) {
  try {
    const res = await fetch(src);
    if (!res.ok) {
      console.error('can not fetch', src);
      return undefined;
    }
    const buffer = await res.arrayBuffer();
    const size = lookup(Buffer.from(buffer));
    if (size) {
      return {
        width: size.width,
        height: size.height,
        type: size.type,
        size: buffer.byteLength,
      };
    }
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

export const getImageSizeServer = (
  sys: OptimizerSystem,
  rootDir: string,
  srcDir: string
): Connect.NextHandleFunction => {
  return async (req, res, next) => {
    const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
    const path: typeof import('path') = await sys.dynamicImport('node:path');

    const url = new URL(req.url!, 'http://localhost:3000/');
    if (req.method === 'GET' && url.pathname === '/__image_info') {
      const imageURL = url.searchParams.get('url');
      res.setHeader('content-type', 'application/json');
      if (imageURL) {
        const info = await getInfoForSrc(imageURL);
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        if (!info) {
          res.statusCode = 500;
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
      try {
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
      } catch (e) {
        console.error('Error auto fixing image', e, url);
      }
    } else {
      next();
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

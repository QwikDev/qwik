import imageSize from 'image-size';
import type { Connect } from 'vite';
import type { OptimizerSystem } from '../types';

export async function getInfoForSrc(src: string) {

  try {
    const res = await fetch(src);
    if (!res.ok) {
      console.error('can not fetch', src);
      return undefined;
    }
    const buffer = await res.arrayBuffer();
    const size = imageSize(Buffer.from(buffer));
    if (size) {
      return {
        width: size.width,
        height: size.height,
        type: size.type,
        size: buffer.byteLength,
      }
    }
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

export const getImageSizeServer = (sys: OptimizerSystem, srcDir: string) => {
  const handler: Connect.NextHandleFunction =async (req, res, next) => {
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
        const info = {'message': 'error'};
        res.write(JSON.stringify(info));
      }
      res.end();
      return;
    } else if (req.method === 'POST' && url.pathname === '/__image_fix') {
      try {

        const loc = url.searchParams.get('loc') as string;
        const width = url.searchParams.get('width');
        const height = url.searchParams.get('height');
        const locParts = loc.split(':');
        const column = parseInt(locParts[locParts.length - 1], 10) - 1;
        let line = parseInt(locParts[locParts.length - 2], 10) - 1;
        const filePath = path.resolve(srcDir, locParts.slice(0, locParts.length-2).join(':'));
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

          if (text.slice(offset, offset + 4) === '<img') {
            const end = text.indexOf('>', offset);
            let imgTag = text.slice(offset, end);
            imgTag = imgTag.replace(/width=({|'|").*(}|'|")/, `width="${width}"`);
            imgTag = imgTag.replace(/height=({|'|").*(}|'|")/, `height="${height}"`);
            if (!imgTag.includes('height=')) {
              imgTag = imgTag.replace(/<img/, `<img height="${height}"`);
            }
            if (!imgTag.includes('width=')) {
              imgTag = imgTag.replace(/<img/, `<img width="${width}"`);
            }
            text = text.slice(0, offset) + imgTag + text.slice(end);
            fs.writeFileSync(filePath, text);
          }
      } catch (e) {
        console.error('Error auto fixing image', e, url);
      }

    } else {
      next();
    }
  }
  return handler;
};
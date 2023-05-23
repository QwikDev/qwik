import imageSize from 'image-size';
import type { Connect } from 'vite';

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

export const imageSizeServer: Connect.NextHandleFunction = async (req, res, next) => {
  const url = new URL(req.url!, 'http://localhost:3000/');
  if (req.method === 'GET' && url.pathname === '/__image_info') {
    const imageURL = url.searchParams.get('url');
    res.setHeader('content-type', 'application/json');
    if (imageURL) {
      const info = await getInfoForSrc(imageURL);
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
  } else {
    next();
  }
}
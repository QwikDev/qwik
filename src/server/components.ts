import { ComponentChild, FunctionComponent, Fragment, jsx } from '@builder.io/qwik';
import { getQwikLoaderScript } from '@builder.io/qwik/optimizer';

export interface QwikLoaderProps {
  events?: string[];
  debug?: boolean;
}

export const QwikLoader: FunctionComponent<QwikLoaderProps> = ({ events, debug }) => {
  return jsx('script', {
    type: 'module',
    children: [getQwikLoaderScript({ events, debug })],
  });
};

export interface QwikProtocolProps {
  protocols?: { [protocol: string]: string };
  baseURI?: string;
}

export const QwikProtocols: FunctionComponent<QwikProtocolProps> = ({ protocols, baseURI }) => {
  const children: ComponentChild[] = [];

  if (typeof baseURI === 'string') {
    children.push(
      jsx('link', {
        rel: 'q.baseURI',
        href: baseURI,
      })
    );
  }

  if (protocols) {
    for (const protocol in protocols) {
      const href = protocols[protocol];
      if (typeof href === 'string') {
        children.push(
          jsx('link', {
            rel: 'q.protocol.' + protocol,
            href,
          })
        );
      }
    }
  }

  return jsx(Fragment, { children });
};

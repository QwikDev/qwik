import type { FunctionComponent } from '@builder.io/qwik';
import { jsx } from '@builder.io/qwik';
import { getQwikLoaderScript } from '@builder.io/qwik/optimizer';

export interface QwikLoaderProps {
  events?: string[];
  debug?: boolean;
}

export const QwikLoader: FunctionComponent<QwikLoaderProps> = ({ events, debug }) =>
  jsx('script', {
    type: 'module',
    children: [getQwikLoaderScript({ events, debug })],
  });

export interface QwikBaseURIProps {
  href: string;
}

export const QwikBaseURI: FunctionComponent<QwikBaseURIProps> = ({ href }) => {
  if (href) {
    return jsx('link', {
      rel: 'q.baseURI',
      href,
    });
  }
  return null;
};

export interface QwikProtocolProps {
  protocol: string;
  href: string;
}

export const QwikProtocol: FunctionComponent<QwikProtocolProps> = ({ protocol, href }) => {
  if (protocol && href) {
    return jsx('link', {
      rel: 'q.protocol.' + protocol,
      href,
    });
  }
  return null;
};

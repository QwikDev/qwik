import type { PropFunction, Signal } from '@builder.io/qwik';
import type { FunctionComponent } from 'react';
import type { Root } from 'react-dom/client';

export interface Internal<PROPS> {
  root: Root | undefined;
  cmp: FunctionComponent<PROPS>;
}

export interface QwikifyBase {
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:hover'?: boolean;
  'client:only'?: boolean;
  'client:signal'?: Signal<boolean>;
  'client:event'?: string | string[];
  'host:onClick$'?: PropFunction<(ev: Event) => void>;
  'host:onBlur$'?: PropFunction<(ev: Event) => void>;
  'host:onFocus$'?: PropFunction<(ev: Event) => void>;
  'host:onMouseOver$'?: PropFunction<(ev: Event) => void>;
  children?: any;
}

export type TransformProps<PROPS extends {}> = {
  [K in keyof PROPS as TransformKey<K>]: TransformProp<K, PROPS[K]>;
};

export type TransformKey<K extends string | number | symbol> = K extends `on${string}`
  ? `${K}$`
  : K;

export type TransformProp<K extends string | number | symbol, V> = K extends `on${string}`
  ? V extends Function
    ? PropFunction<V>
    : never
  : V;

export type QwikifyProps<PROPS extends {}> = TransformProps<PROPS> & QwikifyBase;

export interface QwikifyOptions {
  tagName?: string;
  eagerness?: 'load' | 'visible' | 'idle' | 'hover';
  event?: string | string[];
  clientOnly?: boolean;
}

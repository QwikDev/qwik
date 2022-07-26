import { parseQRL, stringifyQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import type { ContainerState } from '../render/notify-render';
import { isResourceReturn, parseResourceReturn, serializeResource } from '../use/use-resource';
import {
  isSubscriberDescriptor,
  parseWatch,
  ResourceReturn,
  serializeWatch,
  SubscriberDescriptor,
} from '../use/use-watch';
import { getDocument } from '../util/dom';
import { isDocument } from '../util/element';
import type { GetObject, GetObjID } from './store';

export const UNDEFINED_PREFIX = '\u0010';
export const QRL_PREFIX = '\u0011';
export const DOCUMENT_PREFIX = '\u0012';
export const RESOURCE_PREFIX = '\u0013';
export const WATCH_PREFIX = '\u0014';
export const URL_PREFIX = '\u0015';

export interface Serializer<T> {
  prefix: string;
  test: (obj: any) => boolean;
  serialize?: (obj: T, getObjID: GetObjID, containerState: ContainerState) => string;
  prepare: (data: string, containerState: ContainerState) => T;
  fill?: (obj: T, getObject: GetObject, containerState: ContainerState) => void;
}

const UndefinedSerializer: Serializer<undefined> = {
  prefix: UNDEFINED_PREFIX,
  test: (obj) => obj === undefined,
  prepare: () => undefined,
};

const QRLSerializer: Serializer<QRLInternal> = {
  prefix: QRL_PREFIX,
  test: (v) => isQrl(v),
  serialize: (obj, getObjId, containerState) => {
    return stringifyQRL(obj, {
      $platform$: containerState.$platform$,
      $getObjId$: getObjId,
    });
  },
  prepare: (data, containerState) => {
    return parseQRL(data, containerState.$containerEl$);
  },
  fill: (qrl, getObject) => {
    if (qrl.$capture$ && qrl.$capture$.length > 0) {
      qrl.$captureRef$ = qrl.$capture$.map(getObject);
      qrl.$capture$ = null;
    }
  },
};

const DocumentSerializer: Serializer<Document> = {
  prefix: DOCUMENT_PREFIX,
  test: (v) => isDocument(v),
  prepare: (_, containerState) => {
    return getDocument(containerState.$containerEl$);
  },
};

const ResourceSerializer: Serializer<ResourceReturn<any>> = {
  prefix: RESOURCE_PREFIX,
  test: (v) => isResourceReturn(v),
  serialize: (obj, getObjId) => {
    return serializeResource(obj, getObjId);
  },
  prepare: (data) => {
    return parseResourceReturn(data);
  },
  fill: (resource, getObject) => {
    if (resource.state === 'resolved') {
      resource.resolved = getObject(resource.resolved);
      resource.promise = Promise.resolve(resource.resolved);
    }
  },
};

const WatchSerializer: Serializer<SubscriberDescriptor> = {
  prefix: WATCH_PREFIX,
  test: (v) => isSubscriberDescriptor(v),
  serialize: (obj, getObjId) => serializeWatch(obj, getObjId),
  prepare: (data) => parseWatch(data) as any,
  fill: (watch, getObject) => {
    watch.$el$ = getObject(watch.$el$ as any);
    watch.$qrl$ = getObject(watch.$qrl$ as any);
    if (watch.$resource$) {
      watch.$resource$ = getObject(watch.$resource$ as any);
    }
  },
};

const serializers: Serializer<any>[] = [
  UndefinedSerializer,
  QRLSerializer,
  DocumentSerializer,
  ResourceSerializer,
  WatchSerializer,
];

export const serializeValue = (obj: any, getObjID: GetObjID, containerState: ContainerState) => {
  for (const s of serializers) {
    if (s.test(obj)) {
      let value = s.prefix;
      if (s.serialize) {
        value += s.serialize(obj, getObjID, containerState);
      }
      return value;
    }
  }
  return undefined;
};

export interface Parser {
  prepare(data: string): any;
  fill(obj: any): boolean;
}

export const createParser = (getObject: GetObject, containerState: ContainerState): Parser => {
  const map = new Map<any, Serializer<any>>();
  return {
    prepare(data: string) {
      for (const s of serializers) {
        if (data.startsWith(s.prefix)) {
          const value = s.prepare(data.slice(s.prefix.length), containerState);
          if (s.fill) {
            map.set(value, s);
          }
          return value;
        }
      }
      return data;
    },
    fill(obj: any) {
      const serializer = map.get(obj);
      if (serializer) {
        serializer.fill!(obj, getObject, containerState);
        return true;
      }
      return false;
    },
  };
};

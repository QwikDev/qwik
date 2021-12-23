import { ParsedQRL, parseQRL, QRL } from '../import/qrl';
import { toDevModeQRL } from '../import/qrl-test';
import { useInvoke } from '../use/use-core.public';
import { qTest } from '../util/qdev';
import type { ValueOrPromise } from '../util/types';
import type { PropsOf, QComponent, StateOf } from './q-component.public';
import { getHostElement } from './q-component-ctx';
import { qProps } from '../props/q-props.public';
import type { QPropsContext } from '../props/q-props';

/**
 * @alpha
 */
export const qHookMap = new Map();

/**
 * @public
 */
export function qHook<
  PROPS extends {},
  STATE extends {} | undefined | unknown,
  ARGS extends {} | undefined | unknown,
  RET
>(
  hook: (props: PROPS, state: STATE, args: ARGS) => ValueOrPromise<RET>
): QHook<PROPS, STATE, ARGS, RET>;
/**
 * @public
 */
export function qHook<COMP extends QComponent, ARGS extends {} | unknown = unknown, RET = unknown>(
  hook: (props: PropsOf<COMP>, state: StateOf<COMP>, args: ARGS) => ValueOrPromise<RET>
): QHook<PropsOf<COMP>, StateOf<COMP>, any, RET>;

/**
 * @public
 */
export function qHook(hook: any, symbol?: string): any {
  if (typeof symbol === 'string') {
    qHookMap.set(symbol, hook);

    let match;
    if ((match = String(hook).match(EXTRACT_IMPORT_PATH)) && match[2]) {
      hook = match[2];
    } else if ((match = String(hook).match(EXTRACT_SELF_IMPORT))) {
      const frame = new Error('SELF').stack!.split('\n')[2];
      match = frame.match(EXTRACT_FILE_NAME);
      if (!match) {
        hook = 'main';
      } else {
        hook = match[1];
      }
    } else {
      throw new Error('dynamic import not found: ' + String(hook));
    }
    hook =
      (hook.startsWith('.') ? '' : './') +
      (hook.endsWith('.js') ? hook.substr(0, hook.length - 3) : hook) +
      '#' +
      symbol;
  }
  if (typeof hook === 'string') {
    return parseQRL(hook);
  }
  const qrlFn = async (element: HTMLElement, event: Event, url: URL) => {
    const isQwikInternalHook = typeof event == 'string';
    // isQwikInternalHook && console.log('HOOK', event, element, url);
    // `isQwikInternalHook` is a bit of a hack. When events fire we need to treat self as host
    // but if it is regular event than we need to skip us.
    const hostElement = getHostElement(isQwikInternalHook ? element : element.parentElement!);
    const props = hostElement && qProps(hostElement);
    const parsedQRL: ParsedQRL =
      props && (parseQRL(url.toString() as any, (props as QPropsContext).__qMap__) as any);
    const state = props && parsedQRL && (props as any)['state:' + parsedQRL.getState()];
    const args = parsedQRL && parsedQRL.args;
    return await useInvoke(
      () => (hook as Function)(props as any, state, args as any),
      hostElement,
      event,
      url
    );
  };
  if (qTest) {
    return toDevModeQRL(qrlFn, new Error());
  }
  return qrlFn;
}

/**
 * @public
 */
export interface QHook<
  PROPS extends {},
  STATE extends {} | undefined | unknown = undefined,
  ARGS extends {} | undefined | unknown = undefined,
  RET = unknown
> extends QRL<(props: PROPS, state: STATE, args: ARGS) => ValueOrPromise<RET>> {
  __brand__: 'QHook';
  with(args: ARGS): QHook<PROPS, STATE, ARGS, RET>;
}

// https://regexr.com/68v72
const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;

// https://regexr.com/690ds
const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;

// https://regexr.com/6a83h
const EXTRACT_FILE_NAME = /[\\/(]([\w\d.\-_]+)\.(js|ts)x?:/;

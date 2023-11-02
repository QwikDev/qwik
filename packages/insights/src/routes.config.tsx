/**
 * This file is created as part of the typed routes, but it is intended to be modified by the
 * developer.
 *
 * @file
 */
import { untypedAppUrl, omitProps } from '@builder.io/qwik-labs';
import { type AppLinkProps, type AppRouteParamsFunction } from './routes.gen';
import { type QwikIntrinsicElements } from '@builder.io/qwik';

/** Configure `appUrl` with the typed information of routes. */
export const appUrl = untypedAppUrl as AppRouteParamsFunction;

/**
 * Configure `<AppLink/>` component with the typed information of routes.
 *
 * NOTE: you may consider changing `<a>` to `<Link>` to be globally applied across your application.
 */
export function AppLink(props: AppLinkProps & QwikIntrinsicElements['a']) {
  return (
    <a
      href={(appUrl as (route: string, props: any, prefix: string) => string)(
        props.route,
        props,
        'param:'
      )}
      {...(omitProps as Function)(props, ['href'])}
    >
      {props.children}
    </a>
  );
}

/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/**
 * `QRL` (Qoot Resource Locator) represents an import which points to a lazy loaded resource.
 *
 * QRL is a URL pointing to a lazy loaded resource. Because the URLs need to be verified
 * (and possibly bundled) there needs to be a way to identify all URL strings in the system.
 * QRL serves the purpose of statically tagging all URLs for static code analysis and for
 * development mode verification.
 *
 * QRLs can use custom protocols for referring to URLs in a baseURI independent way. This is
 * useful for third-party libraries. Third-party libraries don't know what URL they will be
 * installed at. For this reason the third-party libraries do all QRLs prefixed with
 * custom protocol and rely on the application to configure such protocol.
 *
 * ```
 * QRL`someLibrary:/someImport`
 *
 * Q = {
 *   protocol: {
 *     'someLibrary': 'somePath'
 *   }
 * }
 * ```
 * The `QRL` looks up `foo` in `QRLProtocolMap` resulting in `somePath/someImport`.
 *
 * In dev mode (`qDev=true`) the `QRL` eagerly tries to resolve the URLs to verify that they
 * are correct. This is done to notify the developer of any mistakes as soon as possible.
 *
 * @publicAPI
 */
export interface QRL<T = any> {
  __brand__: 'QRL';
  __brand__T__: T;
}

export type QRLMap<T> = {
  [P in keyof T]: QRL<T[P]>;
};

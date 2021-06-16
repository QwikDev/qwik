/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import { dirname } from '../util/dirname.js';
import global from '../util/global.js';

/**
 * Qwik configuration information.
 *
 * @public
 */
export interface QConfig {
  /**
   * Base URI for resolving QRLs.
   */
  baseURI: string;

  protocol: QRLProtocolMap;
}

/**
 * Protocol aliases.
 *
 * Given
 * ```
 * QRL`foo:/bar`
 *
 * Q = {
 *   protocol: {
 *     'foo': 'somePath'
 *   }
 * }
 * ```
 * The `QRL` looks up `foo` in `QRLProtocolMap` resulting in `somePath/bar`
 * @public
 */
export interface QRLProtocolMap {
  [protocol: string]: string;
}

/**
 * It is expected that `QConfig` is stored on global `Q`
 *
 * Typically this is inserted in main index.html to configure QRLs.
 * ```
 * <script>Q={baseURI: '...', protocols: {}}</script>
 * ```
 *
 */
declare global {
  const Q: QConfig;
}

/**
 * Retrieves the current `QRLProtocolMap` from global configuration.
 *
 * @internal
 */
export function getQRLProtocolMap(): QRLProtocolMap {
  if (!global.Q) {
    global.Q = {};
  }
  return global.Q.protocol || (global.Q.protocol = {});
}

/**
 * Stores multiple `QConfig` when running on server.
 *
 * A single node.js server can server more than one applications.
 * We want `QRL` to be relative to each application for this reason
 * a single node.js server may have more than one `QConfig`.
 *
 * We store the `QConfig` in `configs` and than we us the current
 * baseURI to determine which of the `QConfig`s are relevant.
 */
const configs: QConfig[] = [];

/**
 * Configure `QConfig` for portion of node.js application.
 *
 * In browser the `QConfig` is stored on Window. See `global.Q`.
 *
 * In node.js there is no `Window` and there can be more than one
 * `QConfig`s active as there can be more than one application being served.
 *
 * In node.js use `setConfig` to configure a subtree. (`import.meta.url` defines the sub-tree.)
 * ```
 * setConfig({
 *   baseURI: dirname(import.meta.url),
 *   protocol: {
 *     ui: './ui',
 *     data: './data',
 *   },
 * });
 * ```
 *
 * @param config - `QConfig` to add.
 * @public
 */
export function setConfig(config: QConfig) {
  if (!config.baseURI.endsWith('/')) {
    config.baseURI = dirname(config.baseURI);
  }
  config.baseURI = normalizeBaseUri(config.baseURI);
  configs.push(config);
  configs.sort((a, b) => {
    return b.baseURI.length - a.baseURI.length;
  });
}

function normalizeBaseUri(baseURI: string): string {
  if (baseURI.startsWith('/')) {
    baseURI = 'file://' + baseURI;
  }
  return baseURI;
}

/**
 * Retrieves the current `QConfig`.
 *
 * `QConfig` is retrieved either from `configs` or from `global.Q` if browser.
 *
 * @param path
 * @returns
 * @internal
 */
export function getConfig(path?: string): QConfig {
  if (path != null) {
    path = normalizeBaseUri(path);
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      if (path.startsWith(config.baseURI)) {
        return config;
      }
    }
  }
  if (typeof document === 'undefined') {
    // We are in Node.js
    throw qError(
      QError.Core_qConfigNotFound_path,
      path + '\n' + configs.map((c) => JSON.stringify(c)).join('\n')
    );
  }

  if (!global.Q) {
    global.Q = {};
  }
  if (!Q.baseURI) {
    Q.baseURI = document.baseURI;
  }
  if (!Q.protocol) {
    Q.protocol = {};
  }
  return Q;
}

/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */


/**
 * Type definition for event-handler used for processing events from `qoot`
 * loader.
 *
 * @param event Event associated with the click
 * @param element Element where declarative listener was found
 * @param url Parsed URL associated with the declarative event
 */
export type EventHandler = (event: Event, element: Element, url: URL) => void;
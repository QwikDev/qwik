/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { AttributeMarker } from '../util/markers.js';
import { assertDefined } from '../assert/assert.js';
import { Component, jsxFactory, QRL, Entity } from '../index.js';
import { getInjector } from '../injector/element_injector.js';
import { Injector } from '../injector/types.js';
import { jsxRender, JSXFactory } from '../render/jsx/index.js';
import { HostElements } from '../render/types.js';
import { ElementFixture, ElementFixtureOptions } from './element_fixture.js';

const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `ComponentFixture` creates:
 *
 * ```
 * <host decl:template="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * It also sets up `injector` which points to `child`.
 *
 */
export class ComponentFixture extends ElementFixture {
  template: JSXFactory | null = null;
  injector: Injector;

  constructor(options?: ElementFixtureOptions) {
    super(options);
    this.host.setAttribute(
      AttributeMarker.ComponentTemplate,
      String(QRL`${import.meta.url.replace(/\.js$/, '.noop')}`)
    );
    this.injector = getInjector(this.host);
  }

  render(): Promise<HostElements> | null {
    if (this.template) {
      const injector = getInjector(this.host);
      return jsxRender(
        this.host,
        this.template.call(injector, injector.elementProps),
        this.document
      );
    }
    return null;
  }
}

/**
 * Noop rendering used by `ComponentFixture`.
 */
export const noop = function () {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'test-component': any;
    }
  }
}

////////////////////////////////////////////////////////////
// `GreeterComponent` definition useful for writing tests
////////////////////////////////////////////////////////////
export interface GreeterProps {
  salutation: string;
  name: string;
}
export interface Greeter {
  greeting: string;
}

export class GreeterComponent extends Component<GreeterProps, Greeter> {
  static $templateQRL = QRL`${import.meta.url.replace(/\.js$/, '#greeterTemplate')}`;

  greeting: string = null!;

  async $init() {
    this.greeting = this.$state.greeting;
  }

  async $newState(state: GreeterProps) {
    return { greeting: state.salutation + ' ' + state.name + '!' };
  }
}

export function greeterTemplate(props: GreeterProps) {
  return (
    <span>
      {props.salutation} {props.name}!
    </span>
  );
}

////////////////////////////////////////////////////////////
// `PersonEntity` definition useful for writing tests
////////////////////////////////////////////////////////////

export interface PersonProps {
  first: string;
  last: string;
}

export interface Person {
  first: string;
  last: string;
  age: number;
}

export class PersonEntity extends Entity<PersonProps, Person> {
  static $qrl = QRL`${import.meta.url.replace(/\.js$/, '#PersonEntity')}`;
  static $type = 'Person';
  static $keyProps = [`last`, 'first'];

  async $newState(props: PersonProps): Promise<Person> {
    const { first, last } = props;
    assertDefined(first, 'first missing');
    assertDefined(last, 'last missing');
    return {
      first,
      last,
      age: first.length + last.length,
    };
  }
}

import { assertDefined } from '../assert/assert';
import { QRL } from '../import';
import { toFileUrl } from '@builder.io/qwik/testing';
import { h } from '@builder.io/qwik';
import { Component } from '../component';
import { Entity } from '../entity';

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

export const GreeterComponentTemplate = QRL`${toFileUrl(__filename).replace(
  /\.tsx$/,
  '#greeterTemplate'
)}`;

export class GreeterComponent extends Component<GreeterProps, Greeter> {
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
  static $qrl = QRL`${toFileUrl(__filename).replace(/\.tsx$/, '#PersonEntity')}`;
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

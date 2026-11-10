import { Brand, brandClass } from './qwik-copy';
import { isServer } from '@qwik.dev/core/build';
/** A back reference to a previously serialized object. */
export class SerializationBackRef {
  constructor(public $path$: number[]) {}
}

isServer && brandClass(SerializationBackRef, Brand.SerializationBackRef);

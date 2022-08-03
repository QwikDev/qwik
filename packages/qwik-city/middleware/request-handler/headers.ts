/**
 * Adopted from https://github.com/mswjs/headers-polyfill
 * MIT License | Artem Zakharchenko
 */

const HEADERS: unique symbol = Symbol('headers');

export class Headers {
  // Normalized header {"name":"a, b"} storage.
  private [HEADERS]: Record<string, string> = {};

  [Symbol.iterator]() {
    return this.entries();
  }

  *keys(): IterableIterator<string> {
    for (const name of Object.keys(this[HEADERS])) {
      yield name;
    }
  }

  *values(): IterableIterator<string> {
    for (const value of Object.values(this[HEADERS])) {
      yield value;
    }
  }

  *entries(): IterableIterator<[string, string]> {
    for (const name of Object.keys(this[HEADERS])) {
      yield [name, this.get(name)!];
    }
  }

  /**
   * Returns a `ByteString` sequence of all the values of a header with a given name.
   */
  get(name: string): string | null {
    return this[HEADERS][normalizeHeaderName(name)] || null;
  }

  /**
   * Sets a new value for an existing header inside a `Headers` object, or adds the header if it does not already exist.
   */
  set(name: string, value: string): void {
    const normalizedName = normalizeHeaderName(name);

    this[HEADERS][normalizedName] = typeof value !== 'string' ? String(value) : value;
  }

  /**
   * Appends a new value onto an existing header inside a `Headers` object, or adds the header if it does not already exist.
   */
  append(name: string, value: string): void {
    const normalizedName = normalizeHeaderName(name);
    const resolvedValue = this.has(normalizedName)
      ? `${this.get(normalizedName)}, ${value}`
      : value;

    this.set(name, resolvedValue);
  }

  /**
   * Deletes a header from the `Headers` object.
   */
  delete(name: string): void {
    if (!this.has(name)) {
      return;
    }

    const normalizedName = normalizeHeaderName(name);
    delete this[HEADERS][normalizedName];
  }

  /**
   * Returns the object of all the normalized headers.
   */
  all(): Record<string, string> {
    return this[HEADERS];
  }

  /**
   * Returns a boolean stating whether a `Headers` object contains a certain header.
   */
  has(name: string): boolean {
    // eslint-disable-next-line
    return this[HEADERS].hasOwnProperty(normalizeHeaderName(name));
  }

  /**
   * Traverses the `Headers` object,
   * calling the given callback for each header.
   */
  forEach<ThisArg = this>(
    callback: (this: ThisArg, value: string, name: string, parent: this) => void,
    thisArg?: ThisArg
  ) {
    for (const name in this[HEADERS]) {
      // eslint-disable-next-line
      if (this[HEADERS].hasOwnProperty(name)) {
        callback.call(thisArg!, this[HEADERS][name], name, this);
      }
    }
  }
}

const HEADERS_INVALID_CHARACTERS = /[^a-z0-9\-#$%&'*+.^_`|~]/i;

function normalizeHeaderName(name: string): string {
  if (typeof name !== 'string') {
    name = String(name);
  }

  if (HEADERS_INVALID_CHARACTERS.test(name) || name.trim() === '') {
    throw new TypeError('Invalid character in header field name');
  }

  return name.toLowerCase();
}

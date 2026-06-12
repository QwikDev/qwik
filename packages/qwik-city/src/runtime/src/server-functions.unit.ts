import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import * as z from 'zod';
import { getRequestEvent, routeAction$, schema$, server$ } from './server-functions';
import type {
  RequestEventBase,
  StandardSchemaV1,
  StandardSchemaValidatorErrorType,
  ValidatorErrorType,
} from './types';

type TestStandardSchema<Input, Output = Input> = StandardSchemaV1<Input, Output>;

const createStandardSchema = <Input, Output = Input>(
  validate: StandardSchemaV1.Props<Input, Output>['validate']
): TestStandardSchema<Input, Output> => ({
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate,
    types: undefined as unknown as StandardSchemaV1.Types<Input, Output>,
  },
});

describe('types', () => {
  test('getRequestEvent returns undefined when no async request store exists', () => {
    const previousStore = globalThis.qcAsyncRequestStore;
    globalThis.qcAsyncRequestStore = undefined;
    try {
      expect(getRequestEvent()).toBeUndefined();
    } finally {
      globalThis.qcAsyncRequestStore = previousStore;
    }
  });

  test('getRequestEvent returns current request from async request store', () => {
    const previousStore = globalThis.qcAsyncRequestStore;
    const requestEvent = { method: 'GET', url: new URL('http://localhost/') } as any;

    globalThis.qcAsyncRequestStore = {
      getStore: vi.fn(() => requestEvent),
    } as any;

    try {
      expect(getRequestEvent()).toBe(requestEvent);
    } finally {
      globalThis.qcAsyncRequestStore = previousStore;
    }
  });

  test('matching', () => () => {
    const foo = () => server$(() => 'hello');

    expectTypeOf(foo).not.toBeAny();
    expectTypeOf(foo).returns.toMatchTypeOf<() => Promise<string>>();
    expectTypeOf(foo).returns.toMatchTypeOf<(sig: AbortSignal) => Promise<string>>();
    expectTypeOf(foo).returns.not.toMatchTypeOf<(meep: boolean) => Promise<string>>();
  });

  test('matching with args', () => () => {
    const foo = () => server$((name: string) => 'hello ' + name);

    expectTypeOf(foo).not.toBeAny();
    expectTypeOf(foo).returns.toMatchTypeOf<(name: string) => Promise<string>>();
    expectTypeOf(foo).returns.toMatchTypeOf<(sig: AbortSignal, name: string) => Promise<string>>();
    expectTypeOf(foo).returns.not.toMatchTypeOf<(meep: boolean) => Promise<string>>();
  });

  test('inferring', () => () => {
    const callIt = () =>
      server$(function () {
        expectTypeOf(this).not.toBeAny();
        expectTypeOf(this).toMatchTypeOf<RequestEventBase>();
        return this;
      })();

    expectTypeOf(callIt).not.toBeAny();
    expectTypeOf(callIt).returns.toMatchTypeOf<Promise<RequestEventBase>>();

    const serverGetSourceSnippet = server$(async function (
      publicApiKey: string,
      symbolHash: string
    ) {
      return {
        fullName: 'fullName',
        count: 5,
        origin: 'origin',
        originUrl: 'url',
        source: 'source',
      };
    });
    expectTypeOf(serverGetSourceSnippet).not.toBeAny();
    expectTypeOf(serverGetSourceSnippet('hi', 'there')).toEqualTypeOf<
      Promise<{
        fullName: string;
        count: number;
        origin: string;
        originUrl: string;
        source: string;
      }>
    >();
    expectTypeOf(serverGetSourceSnippet(new AbortController().signal, 'hi', 'there')).toEqualTypeOf<
      Promise<{
        fullName: string;
        count: number;
        origin: string;
        originUrl: string;
        source: string;
      }>
    >();
  });

  test('easy zod type', () => () => {
    const zodSchema = z.object({
      username: z.string(),
      password: z.string(),
    });
    type ErrorType = ValidatorErrorType<z.infer<typeof zodSchema>>['fieldErrors'];

    expectTypeOf<ErrorType>().toEqualTypeOf<{
      username?: string;
      password?: string;
    }>();
  });

  test('array zod type with string', () => () => {
    const zodSchema = z.object({
      arrayWithStrings: z.array(z.string()),
    });
    type ErrorType = ValidatorErrorType<z.infer<typeof zodSchema>>['fieldErrors'];

    expectTypeOf<ErrorType>().toEqualTypeOf<{
      ['arrayWithStrings[]']?: string[];
    }>();
  });

  test('array zod type with object', () => () => {
    const zodSchema = z.object({
      persons: z.array(
        z.object({
          name: z.string(),
          age: z.number(),
        })
      ),
    });
    type ErrorType = ValidatorErrorType<z.infer<typeof zodSchema>>['fieldErrors'];

    expectTypeOf<ErrorType>().toEqualTypeOf<{
      'persons[]'?: string[];
      'persons[].name'?: string[];
      'persons[].age'?: string[];
    }>();
  });

  test('Complex zod type', () => () => {
    const BaseUserSchema = z.object({
      id: z.string().uuid(),
      username: z.string().min(3).max(20),
      email: z.string().email(),
      createdAt: z.date().default(new Date()),
      isActive: z.boolean().default(true),
      someAnyType: z.any(),
      roles: z.array(z.enum(['user', 'admin', 'moderator'])).default(['user']),
      preferences: z
        .object({
          theme: z.enum(['light', 'dark']).default('light'),
          notifications: z.boolean().default(true),
        })
        .optional(),
    });

    // Schema for an Admin user with additional fields
    const AdminUserSchema = BaseUserSchema.extend({
      adminSince: z.date(),
      permissions: z.array(z.string()),
    }).refine((data) => data.roles.includes('admin'), {
      message: 'Admin role must be included in roles',
    });

    // Schema for a Moderator user with additional fields
    const ModeratorUserSchema = BaseUserSchema.extend({
      moderatedSections: z.array(z.string()),
    }).refine((data) => data.roles.includes('moderator'), {
      message: 'Moderator role must be included in roles',
    });

    // Union of all user types
    const UserSchema = z.union([AdminUserSchema, ModeratorUserSchema, BaseUserSchema]);

    type ErrorType = ValidatorErrorType<z.infer<typeof UserSchema>>['fieldErrors'];
    type EqualType = {
      username?: string;
      id?: string;
      email?: string;
      isActive?: string;
      preferences?: string;
      'roles[]'?: string[];
      'permissions[]'?: string[];
      'moderatedSections[]'?: string[];
    };

    expectTypeOf<ErrorType>().toEqualTypeOf<EqualType>();

    expectTypeOf<ErrorType>().not.toEqualTypeOf<{
      someAnyType?: string;
    }>();
  });

  test('standard schema type with array dot paths', () => () => {
    type Input = {
      title: string;
      items?: {
        name: string;
        tags: string[];
      }[];
    };
    type ErrorType = StandardSchemaValidatorErrorType<Input>['fieldErrors'];
    type EqualType = {
      title?: string[];
      items?: string[];
      [key: `items.${number}`]: string[] | undefined;
      [key: `items.${number}.name`]: string[] | undefined;
      [key: `items.${number}.tags`]: string[] | undefined;
      [key: `items.${number}.tags.${number}`]: string[] | undefined;
    };

    expectTypeOf<ErrorType>().toEqualTypeOf<EqualType>();
    expectTypeOf<ErrorType>().not.toEqualTypeOf<{
      ['items[]']?: string[];
      ['items[].name']?: string[];
    }>();
  });

  test('standard schema error type distributes over unions', () => () => {
    type Input = { kind: 'user'; user: { name: string } } | { kind: 'org'; org: { slug: string } };
    type ErrorType = StandardSchemaValidatorErrorType<Input>['fieldErrors'];
    type EqualType = {
      kind?: string[];
      user?: string[];
      'user.name'?: string[];
      org?: string[];
      'org.slug'?: string[];
    };

    expectTypeOf<ErrorType>().toEqualTypeOf<EqualType>();
  });

  test('standard schema action infers input, output, and string array errors', () => () => {
    const schema = createStandardSchema<{ id: string }, { id: number }>((value) => ({
      value: { id: Number((value as { id: string }).id) },
    }));
    const action = routeAction$((data) => {
      expectTypeOf(data).toEqualTypeOf<{ id: number }>();
      return { ok: true };
    }, schema$(schema));
    type ActionValue = ReturnType<typeof action>['value'];

    expectTypeOf<ActionValue>().toMatchTypeOf<
      | { ok: boolean }
      | {
          failed: true;
          formErrors: string[];
          fieldErrors: { id?: string[] };
        }
      | undefined
    >();
  });

  test('standard schema validates successfully', async () => {
    const schema = schema$(
      createStandardSchema<{ id: string }, { id: number }>((value) => ({
        value: { id: Number((value as { id: string }).id) },
      }))
    );

    await expect(schema.validate(undefined as any, { id: '42' })).resolves.toEqual({
      success: true,
      data: { id: 42 },
    });
  });

  test('standard schema supports callable schemas', async () => {
    const callableSchema = Object.assign(() => 'schema function result', {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) => ({ value: String(value) }),
        types: undefined as unknown as StandardSchemaV1.Types<string>,
      },
    }) satisfies StandardSchemaV1<string>;
    const schema = schema$(callableSchema);

    await expect(schema.validate(undefined as any, 'hello')).resolves.toEqual({
      success: true,
      data: 'hello',
    });
  });

  test('standard schema flattens issues to numeric dot paths', async () => {
    const schema = schema$(
      createStandardSchema<{ items: { name: string }[] }>(() => ({
        issues: [
          { message: 'Form issue' },
          { message: 'Items issue', path: ['items'] },
          { message: 'Name issue', path: ['items', 0, { key: 'name' }] },
          { message: 'Second name issue', path: ['items', 0, 'name'] },
        ],
      }))
    );

    await expect(schema.validate(undefined as any, { items: [{ name: '' }] })).resolves.toEqual({
      success: false,
      status: 400,
      error: {
        formErrors: ['Form issue'],
        fieldErrors: {
          items: ['Items issue'],
          'items.0.name': ['Name issue', 'Second name issue'],
        },
      },
    });
  });

  test('standard schema can be created from the request event and parse the request body', async () => {
    const requestEvent = {
      parseBody: vi.fn(async () => ({ token: 'abc' })),
      sharedMap: new Map(),
      cookie: {},
    };
    const schema = schema$((ev) =>
      createStandardSchema<{ token: string }, { token: string; url: string }>((value) => ({
        value: { token: (value as { token: string }).token, url: ev.url.pathname },
      }))
    );

    await expect(
      schema.validate(
        { ...requestEvent, url: new URL('https://qwik.dev/submit') } as any,
        undefined
      )
    ).resolves.toEqual({
      success: true,
      data: { token: 'abc', url: '/submit' },
    });
    expect(requestEvent.parseBody).toHaveBeenCalledOnce();
  });
});

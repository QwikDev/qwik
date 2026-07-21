import { describe, expect, expectTypeOf, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  asyncRequestStore: undefined as { getStore: () => unknown } | undefined,
}));

vi.mock('../../middleware/request-handler/async-request-store', () => ({
  get _asyncRequestStore() {
    return mocks.asyncRequestStore;
  },
}));

import { type } from 'arktype';
import { Schema } from 'effect';
import * as v from 'valibot';
import * as z from 'zod';
import * as zm from 'zod/mini';
import { routeLoader$ } from './route-loaders';
import {
  flattenStandardIssues,
  getRequestEvent,
  routeAction$,
  server$,
  validateStandardSchema,
} from './server-functions';
import type { RequestEventBase, ValidatorErrorType } from './types';

describe('types', () => {
  test('getRequestEvent returns undefined when no async request store exists', () => {
    mocks.asyncRequestStore = undefined;

    expect(getRequestEvent()).toBeUndefined();
  });

  test('getRequestEvent returns current request from async request store', () => {
    const requestEvent = { method: 'GET', url: new URL('http://localhost/') } as any;

    mocks.asyncRequestStore = {
      getStore: vi.fn(() => requestEvent),
    };

    expect(getRequestEvent()).toBe(requestEvent);
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

  test('routeAction$ accepts invalidate without validators', () => () => {
    const useData = routeLoader$(() => ({ ok: true }));
    const useAction = routeAction$((form) => form, { invalidate: [useData] });

    expectTypeOf(useAction).not.toBeAny();
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

  test('zod/mini schema satisfies the zod$ constructor and error typing', () => () => {
    const miniSchema = zm.object({
      username: zm.string(),
      password: zm.string(),
    });

    type SatisfiesConstructor = typeof miniSchema extends z.core.$ZodType ? true : false;
    expectTypeOf<SatisfiesConstructor>().toEqualTypeOf<true>();

    type ErrorType = ValidatorErrorType<zm.infer<typeof miniSchema>>['fieldErrors'];
    expectTypeOf<ErrorType>().toEqualTypeOf<{
      username?: string;
      password?: string;
    }>();
  });
});

describe('flattenStandardIssues', () => {
  test('keys scalar fields by dotted path', () => {
    expect(
      flattenStandardIssues([
        { message: 'Invalid string', path: ['username'] },
        { message: 'Invalid email', path: ['person', 'email'] },
      ])
    ).toEqual({
      formErrors: [],
      fieldErrors: { username: 'Invalid string', 'person.email': 'Invalid email' },
    });
  });

  test('collapses numeric indices to [] and groups messages', () => {
    expect(
      flattenStandardIssues([
        { message: 'Required', path: ['persons', 0, 'name'] },
        { message: 'Too short', path: ['persons', 1, 'name'] },
        { message: 'Required', path: ['tags', 0] },
      ])
    ).toEqual({
      formErrors: [],
      fieldErrors: {
        'persons[].name': ['Required', 'Too short'],
        'tags[]': ['Required'],
      },
    });
  });

  test('routes empty-path issues to formErrors', () => {
    expect(
      flattenStandardIssues([
        { message: 'Object invalid', path: [] },
        { message: 'Also root' },
        { message: 'Field bad', path: ['name'] },
      ])
    ).toEqual({
      formErrors: ['Object invalid', 'Also root'],
      fieldErrors: { name: 'Field bad' },
    });
  });

  test('normalizes object path segments', () => {
    expect(
      flattenStandardIssues([
        { message: 'Invalid', path: [{ key: 'person' }, { key: 'name' }] },
        { message: 'Required', path: [{ key: 'items' }, { key: 0 }] },
      ])
    ).toEqual({
      formErrors: [],
      fieldErrors: { 'person.name': 'Invalid', 'items[]': ['Required'] },
    });
  });
});

describe('validateStandardSchema', () => {
  const ev = { locale: () => undefined } as any;

  test('zod: success returns the parsed output', async () => {
    const result = await validateStandardSchema(ev, z.object({ name: z.string() }), {
      name: 'Qwik',
    });
    expect(result).toEqual({ success: true, data: { name: 'Qwik' } });
  });

  test('zod: failure returns flattened field errors', async () => {
    const result = await validateStandardSchema(ev, z.object({ name: z.string() }), { name: 123 });
    expect(result.success).toBe(false);
    expect(result).toMatchObject({ status: 400, error: { formErrors: [] } });
    expect(
      (result as { error: { fieldErrors: Record<string, unknown> } }).error.fieldErrors
    ).toHaveProperty('name');
  });

  test('valibot: rides the same path and returns the parsed output', async () => {
    const result = await validateStandardSchema(ev, v.object({ name: v.string() }), {
      name: 'Qwik',
    });
    expect(result).toEqual({ success: true, data: { name: 'Qwik' } });
  });

  test('effect: validates via Schema.standardSchemaV1', async () => {
    const effectSchema = Schema.standardSchemaV1(Schema.Struct({ name: Schema.String }));
    const result = await validateStandardSchema(ev, effectSchema, { name: 'Qwik' });
    expect(result).toEqual({ success: true, data: { name: 'Qwik' } });
  });

  test('arktype: validates a callable schema', async () => {
    const result = await validateStandardSchema(ev, type({ name: 'string' }), { name: 'Qwik' });
    expect(result).toEqual({ success: true, data: { name: 'Qwik' } });
  });

  test('zod/mini: validates through the shared path', async () => {
    const result = await validateStandardSchema(ev, zm.object({ name: zm.string() }), {
      name: 'Qwik',
    });
    expect(result).toEqual({ success: true, data: { name: 'Qwik' } });
  });
});

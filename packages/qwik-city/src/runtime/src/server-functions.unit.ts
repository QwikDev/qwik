import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { server$ } from './server-functions';
import type { RequestEventBase, ValidatorErrorType } from './types';

describe('types', () => {
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
});

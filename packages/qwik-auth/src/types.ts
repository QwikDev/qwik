import { Session } from '@auth/core/types';

export interface Provider {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
}

export type Providers = Record<string, Provider>;

export type GetCsrfResult = { csrfToken: string };

export type GetSessionResult = Promise<Session | null>;

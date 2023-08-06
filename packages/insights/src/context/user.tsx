import type { Session } from '@auth/core/types';
import { createContextId } from '@builder.io/qwik';

export type UserData = {
  value?: Session['user'];
};

export const initialUserData: UserData = {};

export const UserContext = createContextId<UserData>('insights.user-context');

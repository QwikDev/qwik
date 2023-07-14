import { type User } from '@supabase/supabase-js';
import { createContextId } from '@builder.io/qwik';

export type UserData = {
  value: User | null;
};

export const initialUserData: UserData = {
  value: null,
};

export const UserContext = createContextId<UserData>('insights.user-context');

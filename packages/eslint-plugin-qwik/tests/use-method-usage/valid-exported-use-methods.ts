import { ContextId, useContext } from '@builder.io/qwik';
export const ID: ContextId<{ value: any }> = null!;
export function useSession1() {
  useContext(ID);
}
export function useSession2() {
  return useContext(ID);
}
export function useSession3() {
  return useContext(ID).value;
}

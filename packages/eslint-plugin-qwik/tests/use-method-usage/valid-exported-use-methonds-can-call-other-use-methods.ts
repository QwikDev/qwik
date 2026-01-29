import { ContextId, useContext } from '@builder.io/qwik';
export const ID: ContextId<{ value: any }> = null!;
export const useSession1 = () => {
  useContext(ID);
};

export const useSession2 = () => {
  return useContext(ID);
};

export const useSession3 = () => useContext(ID);

export const useSession4 = () => useContext(ID).value;

export const useSession5 = () => useContext(ID).value + 10;

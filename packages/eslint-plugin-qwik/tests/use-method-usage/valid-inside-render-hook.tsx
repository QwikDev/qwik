import { useSignal } from '@builder.io/qwik';

declare function renderHook<T>(hook: () => T): Promise<{ result: T }>;

export async function testUseCounter() {
  const { result } = await renderHook(() => {
    const count = useSignal(0);
    return count;
  });
  return result;
}

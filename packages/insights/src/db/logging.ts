import { isDev } from '@builder.io/qwik';

const LOG_TIMING: boolean = isDev;

const now = () => new Date().getTime();

export async function time<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = now();
  let result: T = undefined!;
  try {
    return (result = await fn());
  } catch (e) {
    LOG_TIMING && console.error(name, e);
    throw e;
  } finally {
    LOG_TIMING &&
      console.log(
        `${name} took ${now() - start}ms`,
        Array.isArray(result) ? result.length + ' rows' : ''
      );
  }
}

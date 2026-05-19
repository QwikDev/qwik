import { component$ } from '@qwik.dev/core';
import type { CacheKeyFn } from './types';
import { useHttpStatus } from './use-functions';

/** Cache error pages per status code so all 404s (or 500s) share one cache entry. */
export const cacheKey: CacheKeyFn = (status) => String(status);

const COLOR_400 = '#006ce9';
const COLOR_500 = '#713fc2';

const DisplayHttpStatus = component$(() => {
  const { status, message } = useHttpStatus();
  const width = message ? '600px' : '300px';
  const color = status < 500 ? COLOR_400 : COLOR_500;
  const style = `
			body { color: ${color}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
			p { max-width: ${width}; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px ${color}; overflow: hidden; }
			strong { display: inline-block; padding: 15px; background: ${color}; color: white; }
			span { display: inline-block; padding: 15px; }
	`;

  return (
    <p>
      <style dangerouslySetInnerHTML={style} />
      <strong>{status || 500}</strong> <span>{message || ''}</span>
    </p>
  );
});

export default DisplayHttpStatus;

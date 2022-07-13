import { qError, QError_canNotFindServerContext, QError_canNotMountUseServerContext } from "../error/error";
import { isServer } from "../platform/platform";
import { useSequentialScope } from "./use-store.public";

/**
 * @alpha
 */
 export const useServerContext = <T = any>(key: string): T | undefined => {
  const {get, set, ctx} = useSequentialScope<T>();
  if (get) {
    return get;
  }
  if (isServer(ctx.$doc$)) {
    const value = ctx.$renderCtx$.$containerState$.$userContext$[key];
    if (!value) {
      throw qError(QError_canNotFindServerContext, key, ctx.$renderCtx$.$containerState$.$userContext$);
    }
    return set(value);
  } else {
    throw qError(QError_canNotMountUseServerContext, key, ctx.$hostElement$);
  }
}

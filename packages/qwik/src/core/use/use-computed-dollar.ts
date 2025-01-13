import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { useComputedQrl } from './use-computed';

/**
 * Creates a computed signal which is calculated from the given function. A computed signal is a
 * signal which is calculated from other signals. When the signals change, the computed signal is
 * recalculated, and if the result changed, all tasks which are tracking the signal will be re-run
 * and all components that read the signal will be re-rendered.
 *
 * The function must be synchronous and must not have any side effects.
 *
 * @public
 */
export const useComputed$ = implicit$FirstArg(useComputedQrl);

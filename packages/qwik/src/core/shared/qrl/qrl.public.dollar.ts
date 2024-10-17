import { eventQrl } from './qrl.public';
import { implicit$FirstArg } from './implicit_dollar';

/** @public */
export const event$ = implicit$FirstArg(eventQrl);

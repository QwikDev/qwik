import { loadSecret } from './db.server';

export const getClientValue = () => loadSecret();

/** There's [documentation](./serialization.md) */

export { canSerialize } from './can-serialize';
export { _dumpState } from './dump-state';
export { _inflateQRL } from './inflate';
export { preprocessState } from './preprocess-state';
export { parseQRL, qrlToString } from './qrl-to-string';
export { _deserialize, _serialize, getObjectById } from './serdes.public';
export { createSerializationContext, type SerializationContext } from './serialization-context';

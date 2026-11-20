type StreamGate = typeof globalThis & { __heldStreams?: (() => void)[] };

const heldStreams = ((globalThis as StreamGate).__heldStreams ||= []);

export const holdStream = () => new Promise<void>((release) => heldStreams.push(release));

export const releaseStreams = () => heldStreams.splice(0).forEach((release) => release());

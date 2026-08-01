// WebKit buffers streamed HTML until enough early body content is emitted.
// https://bugs.webkit.org/show_bug.cgi?id=265386
export const WEBKIT_STREAMING_FLUSH = '\u200b'.repeat(512);

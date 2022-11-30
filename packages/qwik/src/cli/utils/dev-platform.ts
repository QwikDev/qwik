export function isDeno() {
  return typeof Deno !== 'undefined';
}
export function getProjectMetadataFileName() {
  return isDeno() ? 'deno.json' : 'package.json';
}
declare const Deno: any;

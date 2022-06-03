export function isNode(value: any): value is Node {
  return value && typeof value.nodeType == 'number';
}
export function isDocument(value: any): value is Document {
  return value && value.nodeType == 9;
}
export function isElement(value: any): value is Element {
  return isNode(value) && value.nodeType === 1;
}
export function isText(value: any): value is Text {
  return isNode(value) && value.nodeType === 3;
}
export function isComment(value: any): value is Comment {
  return isNode(value) && value.nodeType === 9;
}

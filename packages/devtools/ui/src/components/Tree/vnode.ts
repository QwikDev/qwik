import { TreeNode } from './type';
export function normalizeName(str: string) {
  const array = str.split('_');
  if (array.length > 0) {
    const componentName = array[0];
    return (
      componentName.charAt(0).toUpperCase() +
      componentName.slice(1).toLowerCase()
    );
  } else {
    return '';
  }
}

export function removeNodeFromTree(
  tree: TreeNode[],
  callback: (node: TreeNode) => boolean,
) {
  return tree.filter((node) => {
    if (callback(node)) {
      return false;
    }
    if (node.children && node.children.length > 0) {
      node.children = removeNodeFromTree(node.children, callback);
    }

    return true;
  });
}

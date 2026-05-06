import {
  _ElementVNode,
  _VirtualVNode,
  _VNode,
  _vnode_getAttrKeys,
  _vnode_getFirstChild,
  _vnode_isMaterialized,
  _vnode_isVirtualVNode,
} from '@qwik.dev/core/internal';
import { normalizeName } from './vnode';
import { htmlContainer } from '../../utils/location';
import { TreeNode, TreeNodePropValue } from './type';
import { QPROPS, QRENDERFN, QSEQ, QTYPE } from '@qwik.dev/devtools/kit';
import { QRLInternal } from '../../features/RenderTree/types';

let index = 0;
const ALLOWED_PROP_KEYS = new Set<string>([QRENDERFN, QSEQ, QPROPS, 'q:id', 'q:key']);

function initVnode({
  name = 'text',
  props = {},
  children = [],
}: Partial<Pick<TreeNode, 'name' | 'props' | 'children'>> = {}): TreeNode {
  return {
    name,
    props,
    children,
    label: name,
    id: `vnode-${index++}`,
  };
}
export function vnode_toObject(vnodeItem: _VNode | null): TreeNode[] | null {
  if (vnodeItem === null || vnodeItem === undefined) {
    return null;
  }

  return buildTreeRecursive(vnodeItem, false);
}

let _container: ReturnType<typeof htmlContainer> | undefined;
function getContainer() {
  if (!_container) {
    _container = htmlContainer();
  }
  return _container!;
}

function buildTreeRecursive(vnode: _VNode | null, materialize: boolean): TreeNode[] {
  // Return early if the starting node is null.
  if (!vnode) {
    return [];
  }

  const result: TreeNode[] = [];
  let currentVNode: _VNode | null = vnode;

  // Iterate over sibling nodes.
  while (currentVNode) {
    const isVirtual = _vnode_isVirtualVNode(currentVNode);
    // Determine if the node is a Fragment ('F') to be filtered out.
    const isFragment =
      isVirtual && typeof getContainer().getHostProp(currentVNode, QRENDERFN) === 'function';
    if (isFragment) {
      const vnodeObject = initVnode({});

      _vnode_getAttrKeys(getContainer(), currentVNode as _ElementVNode | _VirtualVNode).forEach(
        (key) => {
          // We skip the QTYPE prop as it's for internal use.
          if (key === QTYPE) {
            return;
          }
          // Keep only the fields consumed by Devtools to avoid
          // leaking non-serializable runtime VNode references.
          if (!ALLOWED_PROP_KEYS.has(key)) {
            return;
          }

          const value: unknown = getContainer().getHostProp(currentVNode!, key);
          vnodeObject.props![key] = value as TreeNodePropValue;

          // Special handling to set the label from the render function's symbol.
          if (key === QRENDERFN && value != null) {
            const qrl = value as QRLInternal;
            vnodeObject.label = normalizeName(qrl.getSymbol());
            vnodeObject.name = normalizeName(qrl.getSymbol());
          }
        }
      );

      // Recursively build the tree for child nodes.
      const firstChild = _vnode_getFirstChild(currentVNode);
      const children = firstChild ? buildTreeRecursive(firstChild, materialize) : [];
      if (children.length > 0) {
        vnodeObject.children = children;
      }

      result.push(vnodeObject);
    } else if (_vnode_isMaterialized(currentVNode) || (isVirtual && !isFragment)) {
      // For materialized nodes, similar to Fragments, we skip the container node
      // itself and just process its children.
      const firstChild = _vnode_getFirstChild(currentVNode);
      if (firstChild) {
        result.push(...buildTreeRecursive(firstChild, materialize));
      }
    }

    // Move to the next sibling in the tree.
    currentVNode = currentVNode.nextSibling as _VNode | null;
  }

  return result;
}

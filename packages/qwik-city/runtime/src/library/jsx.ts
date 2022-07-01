import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { DocumentHead } from './types';

export const findJsxNode = (tagName: string, jsxNode: JSXNode): Record<string, any> | null => {
  if (jsxNode != null) {
    if (Array.isArray(jsxNode)) {
      for (const n of jsxNode) {
        const f = findJsxNode(tagName, n);
        if (f != null) {
          return f;
        }
      }
    } else if (typeof jsxNode === 'object') {
      if (typeof jsxNode.type === 'function') {
        return findJsxNode(tagName, jsxNode.type(jsxNode.props));
      }
      if (jsxNode.type === tagName) {
        return jsxNode;
      }
      if (jsxNode.props) {
        return findJsxNode(tagName, jsxNode.props.children);
      }
    }
  }
  return null;
};

export const parseHeadJsx = (pageHead: DocumentHead, jsxNode: JSXNode | null) => {
  if (jsxNode != null) {
    if (Array.isArray(jsxNode)) {
      for (const childJsxNode of jsxNode) {
        parseHeadJsx(pageHead, childJsxNode);
      }
    } else if (typeof jsxNode === 'object' && jsxNode.props != null) {
      const type = jsxNode.type;
      if (typeof type === 'function') {
        parseHeadJsx(pageHead, type(jsxNode.props));
      } else if (type === 'title') {
        pageHead.title = getJsxNodeContent(jsxNode.props);
      } else if (type === 'meta') {
        // pageHead.title = getJsxNodeContent(jsxNode.props);
      } else {
        parseHeadJsx(pageHead, jsxNode.props.children);
      }
    }
  }
};

const getJsxNodeContent = (props: any) => {
  if (typeof props === 'string') {
    return props;
  }
  if (typeof props === 'object' && props.children != null) {
    if (Array.isArray(props.children)) {
      return props.children.map((c: any) => String(c)).join('');
    }
    return String(props.children);
  }
  return '';
};

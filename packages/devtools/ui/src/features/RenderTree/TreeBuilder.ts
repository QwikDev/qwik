import type { TreeNode, ElementType } from '../../components/Tree/type';
import { isValue } from '../../utils/type';

/**
 * Builder class for creating TreeNode structures from objects.
 * Handles all types of data transformation to tree format.
 */
export class TreeBuilder {
  private idCounter = 0;

  /**
   * Generate a unique ID for a tree node
   */
  private generateId(): string {
    return `node-${this.idCounter++}`;
  }

  /**
   * Reset the ID counter (useful for testing)
   */
  resetIdCounter(): void {
    this.idCounter = 0;
  }

  /**
   * Create a group node (parent node with children)
   */
  createGroupNode(label: string, children: TreeNode[] = []): TreeNode {
    return {
      id: this.generateId(),
      label,
      props: {},
      children,
    };
  }

  /**
   * Convert any object to TreeNode array
   */
  objectToTree(obj: unknown, parentPath = ''): TreeNode[] {
    if (!obj || typeof obj !== 'object') {
      return [];
    }

    if (Array.isArray(obj)) {
      return this.arrayToTree(obj, parentPath);
    }

    return this.objectPropertiesToTree(
      obj as Record<string, unknown>,
      parentPath,
    );
  }

  /**
   * Convert array to TreeNode array
   */
  private arrayToTree(arr: unknown[], parentPath: string): TreeNode[] {
    return arr
      .map((item, index) => {
        const path = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
        return this.createNode(item, `[${index}]`, path);
      })
      .filter((node): node is TreeNode => node !== null);
  }

  /**
   * Convert object properties to TreeNode array
   */
  private objectPropertiesToTree(
    obj: Record<string, unknown>,
    parentPath: string,
  ): TreeNode[] {
    const result: TreeNode[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = parentPath ? `${parentPath}.${key}` : key;
      const node = this.createNode(value, key, path);
      if (node) {
        result.push(node);
      }
    }

    return result;
  }

  /**
   * Create a single TreeNode from a value
   */
  private createNode(
    value: unknown,
    key: string,
    path: string,
  ): TreeNode | null {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return this.createPrimitiveNode(key, value, 'null');
    }

    // Handle primitives
    const primitiveNode = this.tryCreatePrimitiveNode(key, value);
    if (primitiveNode) {
      return primitiveNode;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return this.createArrayNode(key, value, path);
    }

    // Handle objects
    if (typeof value === 'object') {
      return this.createObjectNode(key, value as Record<string, unknown>, path);
    }

    return null;
  }

  /**
   * Try to create a primitive node (boolean, number, string, function)
   */
  private tryCreatePrimitiveNode(key: string, value: unknown): TreeNode | null {
    switch (typeof value) {
      case 'boolean':
        return this.createPrimitiveNode(key, value, 'boolean');
      case 'number':
        return this.createPrimitiveNode(key, value, 'number');
      case 'string':
        return this.createPrimitiveNode(key, `"${value}"`, 'string');
      case 'function':
        return this.createFunctionNode(key, value as Function);
      default:
        return null;
    }
  }

  /**
   * Create a node for primitive values
   */
  private createPrimitiveNode(
    key: string,
    value: unknown,
    elementType: ElementType,
  ): TreeNode {
    return {
      id: this.generateId(),
      label: `${key}: ${value}`,
      props: {},
      elementType,
    };
  }

  /**
   * Create a node for function values
   */
  private createFunctionNode(key: string, fn: Function): TreeNode {
    const fnName = fn.name ? `ƒ ${fn.name}()` : 'ƒ()';
    return {
      id: this.generateId(),
      label: `${key}: ${fnName}`,
      props: {},
      elementType: 'function',
    };
  }

  /**
   * Create a node for array values
   */
  private createArrayNode(key: string, arr: unknown[], path: string): TreeNode {
    const children = arr
      .map((item, index) => {
        const childPath = `${path}[${index}]`;
        return this.createNode(item, index.toString(), childPath);
      })
      .filter((node): node is TreeNode => node !== null);

    return {
      id: this.generateId(),
      label: `${key}: Array[${arr.length}]`,
      props: {},
      elementType: 'array',
      children,
    };
  }

  /**
   * Create a node for object values
   */
  private createObjectNode(
    key: string,
    obj: Record<string, unknown>,
    path: string,
  ): TreeNode {
    const constructorName = obj.constructor?.name;
    const isPlainObject = constructorName === 'Object';

    if (!isPlainObject) {
      return this.createClassInstanceNode(key, obj, constructorName);
    }

    const keys = Object.keys(obj);
    const children = Object.entries(obj)
      .map(([childKey, childValue]) => {
        const childPath = `${path}.${childKey}`;
        return this.createNode(childValue, childKey, childPath);
      })
      .filter((node): node is TreeNode => node !== null);

    return {
      id: this.generateId(),
      label: `${key}: Object {${keys.length}}`,
      props: {},
      elementType: 'object',
      children,
    };
  }

  /**
   * Create a node for class instances (non-plain objects)
   */
  private createClassInstanceNode(
    key: string,
    obj: Record<string, unknown>,
    className: string,
  ): TreeNode {
    const node: TreeNode = {
      id: this.generateId(),
      label: `${key}: Class {${className}}`,
      props: {},
      elementType: 'object',
    };

    // Special handling for Signal-like objects with .value property
    if (isValue(obj)) {
      node.children = [this.createNode(obj.value, 'value', 'value')].filter(
        (n): n is TreeNode => n !== null,
      );
    }

    return node;
  }
}

A set of props to be automatically added to the host-element.

Useful when the component needs to have a set of attributes present in the dom before the `OnRender` executes.

### Example

<docs code="./q-component.docs.tsx#props"/>

When rendered as:

```html
<MyComp label="myLabel" name="World" />
```

Would result in:

```html
<my-comp label="myLabel" name="World" title="MyTitle"></my-comp>
```

Notice that `props` provides default values that will be auto-added to the component props (unless the component instantiation props override them.)

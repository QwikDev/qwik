HTML tag to be used for the component's host-element (defaults to `div`.)

Component host-element must be inserted synchronously during rendering. However, the component's view is inserted asynchronously. When inserting the host-element it usually looks something like this:

```html
<div on:q-render="..." on:q-init="..." ...></div>
```

A lot of developers like to stick to `<div>` as the host element, but
one can choose any name they find helpful, such as `my-component`, to make
the DOM more readable.

```html
<my-component on:q-render="..." on:q-init="..." ...></my-component>
```

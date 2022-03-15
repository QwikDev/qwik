---
title: Host element
---

# Host Element

The host element is an element in the DOM that represents component boundaries.

Lite-components do not have host elements.

```typescript=
const Child() => <span>child</span>;
const Parent() => <section><Child/></section>;
```

Will result in:

```htmlembedded=
<section>
  <span>child</span>
</section>
```

Looking at the resulting HTML, it is not possible to tell if a single component or multiple components produced the HTML. It is also not possible to discern where the component boundaries are.

On the other hand, Qwik-components rely on host elements because it must be possible by looking on the HTML to determine where one component starts and another ends. Without knowing the boundaries, it would not be possible to render components independently without forcing parent/child components to render as well. This is a crucial feature of Qwik.

```typescript=
const Child = component$(()=> $(() => <span>child</span>));
const Parent = component$(()=> $(() => <section><Child/></section>));
```

Will result in:

```htmlembedded=
<div q:host>
  <section>
    <div q:host>
      <span>child</span>
    </div>
  </section>
</div>
```

Qwik host elements are marked with `q:host` attribute. (Default element is `div` for host element, but that can be changed with `component$` options argument.) Qwik uses host elements in various ways. For example when using `useHostElement()` function which retrieves it. It is also used to attach props to the components for serialization.

# Lazy loading

The host component also serves an important role when breaking parent-child relationships for bundling purposes.

```typescript=
const Child() => <span>child</span>;
const Parent() => <section><Child/></section>;
```

In the above example, referring to the `Parent` component implies a transitive reference to the `Child` component. When bundler is creating chunk, a reference to `Parent` necessitates bundling `Child` as well. (`Parent` internally refers to `Child`.) These transitive dependencies are a problem because it means that having a reference to the root component will transitively refer to the remainder of the application—something which Qwik tries to avoid explicitly.

```typescript=
const Child = component$(()=> $(() => <span>child</span>));
const Parent = component$(()=> $(() => <section><Child/></section>));
```

In the above example the Optimizer transforms the above to:

```typescript=
const Child = component$(qrl('./chunk-a', 'Child_onMount'));
const Parent = component$(qrl('./chunk-b', 'Parent_onMount'));
const Parent_onMount = () => qrl('./chunk-c', 'Parent_onRender');
const Parent_onRender = () => <section><Child/></section>;
```

NOTE: for simplicity, not all of the transformations are shown; all resulting symbols are kept in the same file for succinctness.

Notice that after the optimizer transforms the code, the `Parent` no longer directly references `Child`. This is important because it allows the bundler (and tree shakers) to freely move the symbols into different chunks without pulling the rest of the application with it.

So what happens when the `Parent` component renders and `Child` component has not yet been downloaded? First, the `Parent` component renders its JSX like so.

```htmlembedded=
<div q:host>
  <section>
    <div q:host></div>
  </section>
</div>
```

As you can see in the above example, the `<div q:host/>` acts as a marker where the `Child` component will be inserted once it is lazy-loaded.

## Mental Model

The optimizer splits Qwik components into the host element and the behavior of the component. The host element gets bundled with the parent components OnRender function, whereas the component's behavior is something that gets lazy-loaded on an as-needed basis.

## Host ELement Attributes & Styling

Assume you have a component defined as so:

```typescript=
const Greeter = component$((props: {salutation?: string, name: string, }) => {
  ...
});
```

The component can be used like so:

```htmlembedded=
<Greeter name="World"/>
```

or

```htmlembedded=
<Greeter salutation="Hello" name="World"/>
```

in both above cases the rendered HTML would be:

```htmlembedded=
<div q:host ></div>
```

Because the host element is an actual element, there may be a desire to place HTML classes, styles, or attributes.

What if you wanted to add a `name` attribute to the host element? The issue is that the `name` is already used by the component props. For this reason, we use `h:` prefix to refer to the host element's attributes.

```htmlembedded=
<Greeter h:name="abc" h:id="greeter" name="world"/>
```

would render as

```htmlembedded=
<div q:host name="abc" id="greeter"></div>
```

Using an `h:` prefix allows the developer to control the component's host element attributes independently from the component's props.

One can use the same approach for `class` and `styles`.

```htmlembedded=
<Greeter h:class="greeter"
        h:style={{backgroundColor: 'red'}}
        name="world"/>
```

would render

```htmlembedded=
<div q:host class="greeter" style="background-color: red;"></div>
```

However, many IDEs will not recognize `h:class` and `h:style` and would not trigger code completion. For this reason, `class` and `styles` are special, and they will automatically map to `h:class` and `h:styles` when placed on the host element.

```htmlembedded=
<Greeter class="greeter"
        style={{backgroundColor: 'red'}}
         name="world"/>
```

would also render to the some output.

```htmlembedded=
<div q:host class="greeter" style="background-color: red;"></div>
```

## `<Host/>`

It may also be desirable for a component to set `class`, `style` and `attributes` on the host element associated with the component itself. To do that, one can use `<Host>` tag.

```typescript
const Greeter = component$(() => {
  return $(() => (
    <Host class="padded" id="greeter">
      <span>Hello World</span>
    </Host>
  ));
});
```

will result in:

```htmlembedded=
<div q:host class="padded" id="greeter">
  <span>Hello World</span>
</div>
```

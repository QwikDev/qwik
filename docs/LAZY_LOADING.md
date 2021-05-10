# Fine-Grained Lazy-Loading

After [resumability](./RESUMABLE.md), fine-grained lazy-loading is next important goal to achieve low [time to interactive](https://web.dev/interactive/) score.

## Frameworks lack lazy-loading primitives

The current generation of frameworks lack lazy loading primitives. Many frameworks have ways of lazy loading routes or small section of templates, but they lack lazy loading at the core level of the framework and with sufficiently fine granularity.

A good way to look at it is that if the browser downloads code, then close to 100% of that code should to be executed. Most frameworks today will download big chunks for code only to execute a small portion of it. Most of the unexecuted code will reside in event handlers and their dependencies.

Frameworks also tend to have synchronous APIs making it hard for the developers to insert lazy-loading asynchronous boundaries.

## Fined-grained lazy-loading as a core primitive

Qoot takes fine-grained lazy-loading to the extreme. Almost all Qoot APIs can be called asynchronously so that lazy-loading can be inserted in case it is needed. That is not to say that you should make everything lazy-loaded as there are tradeoffs, but rather that the framework allows just about anything lazy-loaded in case the need arises.

Lazy loading directly impacts the amount of code which needs to be downloaded, parsed and executed resulting in improved [time to interactive](https://web.dev/interactive/) score.

## Lazy loading event handlers

One of the biggest places where fine-grained lazy-loading can be applied is in the area of event handlers. Applications typically have many event handlers to support user interaction. Most of these event handlers do not get exercised during typical user interactions, but must still be downloaded just-in-case. The event handlers are in form of closures which close over the dependencies of the event handler further increasing the download size. Additionally most frameworks require that templates be rendered for the framework to attach the event handlers to the DOM.

In practice this means that [heap-centric](./RESUMABLE.md) frameworks must execute all of the templates so that they can collect the event handlers and attach them to the DOM, just in case the user will perform an interaction. A developer could place dynamic imports in the event handlers, but in practice this is complicated because event bubbling is synchronous making composing event handlers hard. It also means that a heap-centric framework must download and execute all of the templates currently visible to the user. All of these complications slow down [time to interactive](https://web.dev/interactive/) and do not directly help the developer to do the right thing.

Qoot stores event handlers as string annotations in the DOM. This has several advantages:

- No template needs to be downloaded and rendered in order for the framework to know where the event handlers need to be registered.
- No event handler code needs to be downloaded before it is needed.
- Global event handler registration can be performed saving on event registration during [bootstrap](./BOOTSTRAP.md).
- All event handlers automatically have lazy loaded boundaries. This guides the developer to do the high performance thing by default.

## Lazy loading components

The current generation of frameworks can't render individual components in isolation. The result is that rendering a component requires all of the component's children to be present and executed on each rendering.

To explore this more in depth imagine following render tree:

```html
<parent>
  <middle>
    <child></child>
  </middle>
</parent>
```

Let's say that the framework has determined that only the `<middle>` component needs to be re-rendered. The current generation of frameworks don't have a way to re-render `<middle>` but not to recurse into `<child>`. The lack of this capability means that re-hydration in current frameworks starts with a component and forces re-hydration of all its descendant components. This causes unnecessary downloading, executing and reconciliation. We can say that the approach of current frameworks causes "child component-coupling".

The reverse is also true. Let's say that `<middle>` has a button with a `click` handler. Clicking the button will cause the application to change state (which may be store in redux pattern.) Most current frameworks don't directly track state and so there is no way of knowing which other components need to be invalidated due to execution of the event handler. The only thing the framework can do is to re-render the whole application from the root just-in-case there is a component which depends on the state. We can say that the current approach causes "parent component-coupling".

> Yes, there are some frameworks which track data-flow through subscriptions (reactive frameworks), and such frameworks would know which exact component needs to be updated. The problem is that setting up these subscriptions necessitates the creation of closures which in turn need references to the components. Creation of these subscriptions forces all of the components to be materialized negating any benefits. (see: [Qoot reactivity](./REACTIVITY.md))

Child and parent component-coupling means that in practice all of the currently visible application must be downloaded and present for the application to be user interactive. As applications get bigger and more complicated this requirements means tha the application startup gets slower over time.

Qoot focuses on breaking these dependencies so that neither child nor parent component-coupling are an issue resulting in a rendering model which does not require that templates or event handlers are downloaded until they are needed.

Breaking child component-coupling requires that the Qoot's rendering system understands where component boundaries are, and can conditionally enter child components based on dirty flag of the component. This means that the rendering pipeline of Qoot is asynchronous, and understands how to conditionally download component templates on as needed basis. (Contrast this to current generation frameworks which have synchronous rendering pipelines. This complicates async template loading, and the rendering always enters child components.)

## Out of order component re-hydration

A key goal for Qoot is to allow components to re-hydrate and re-render only when it is necessary. The implication of this is that at times components can re-hydrate out of parent/child order. A non-obvious implication of this is that the framework rendering pipeline needs to understand how to render components from the root, skip non-hydrated components and continue with deep children.

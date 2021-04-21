# Qoot Reactivity

Qoot is a component level reactive, template level reconciliation rendering framework.

All frameworks face the problem of knowing when a component should be re-rendered. There are many different approaches to this problem. Generally the solutions fall into these categories:

- **Reactive:** Reactive frameworks understand the relationships between source of state, and usage of state. For example data is store on this object property and when the property changes then these listeners are invoked which in turn update the UI. Generally reactive frameworks need some sort of subscription system which notifies interest in data and instructions on where the changes should be delivered. (Example would be RxJs.)
  - **Binding level:** Reactive system can further be subdivide into system where the change is delivered directly to a specific DOM property. Such a system would be very fine grained.
  - **Component level:** In contrast to binding level reactive system, a component level reactivity means that a change to data notifies that the component is dirty. At some later point in time the component is fully re-rendered (we don't actually know which binding needs to be changed so we re-render the whole component.)
- **Structured state:** Stores the state of the application in a well know location which is guarded for writes. Any writes result in application view to be considered dirty and the view is than re-rendered with the new state. (Example would be redux pattern.)
- **Unstructured state:** State is stored in memory heap and any execution of the code assumes that there was a write and invalidates the view, scheduling it for re-rendering.

The advantage of reactive systems is that we know when a listener needs to be updated (instead of updating the whole app). The down side is that we need to set up and clean up the listeners. The listeners are usually function closures which close over a component instance and its template. Setting up these kinds of listeners would force code to be downloaded too early defeating the goal of Qoot to only download the immediately necessary code.

Qoot takes the approach of storing application state in services. Components subscribe to services to get notified of service state change. The subscription creates a component level reactive system. The subscription system gives Qoot knowledge to know when and which component should be invalidated and scheduled for re-rendering when the data store changes. This solves the issue of having to re-render the whole app on any state change. Knowing which components subscribe to which service allows Qoot to only download and render the relevant components.

> NOTE: One could build a redux system on top of Qoot services.

The key difference to standard subscription system based of function closures, the Qoot subscription system is based on DOM attribute. This allows the DOM to declare relationships between services and components without having to allocate and execute any subscription listeners or release any listeners when views go away. The subscription system in Qoot is fully declarative and has no runtime overhead of setting up the relationships.

> In practice Qoot uses `querySelectorAll` to find all listeners which are interested in particular state change and only re-hydrates the listening component if the component needs to be re-rendered.

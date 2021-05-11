# Qoot Reactivity

Qoot is a component-level reactive, template-level reconciliation, rendering framework.

All frameworks face the problem of knowing when a component should be re-rendered. There are many different approaches to this problem. Generally, the solutions fall into these categories:

- **Reactive:** Reactive frameworks understand the relationships between the source of state and usage of state. For example, data is stored on an object property. If the property changes, then subscribers are notified, which in turn updates the UI. Generally speaking, reactive frameworks need some form of a subscription system that notifies interest in data. Once subscriber is notified of change to date, the subscriber delivers the change to the UI. (An example would be RxJs.)
  - **Binding level:** Reactive system can be subdivided into a system where the change is delivered directly to a specific DOM property. Such a system would be fine-grained (binding level.)
  - **Component level:** In contrast to a binding level reactive system, a component level reactivity would deliver the change to the component (rather then to a specific binding in the component's template). The delivery of this change would mark the component as dirty. Marking component dirty means that at a later point in time, the component is fully re-rendered (we don't actually know which binding needs to be changed, so we re-render the whole component.)
- **Structured state:** Stores the state of the application in a well-known location. The system guards state against data writes. Any writes to the state result in the whole application view being considered dirty. The reason why the whole application is dirty is because the system does not know which data will end up where, and so it has to assume that any component could be changed as a result of the system write. (Example would be a redux pattern.)
- **Unstructured state:** state is stored in memory heap, and any execution of the code assumes that there was a property write which necessitates the invalidation of the view. This schedules the view for re-rendering. (Example would be Angular with zone.js)

The advantage of reactive systems is that the system knows when a subscriber needs to be updated (instead of updating the whole app.) The downside is that the system needs to set up and clean up the subscriptions. The subscriptions are usually function closures that close over a component instance and its template. Setting up these kinds of subscriptions would force code to be downloaded too early, defeating the goal of Qoot only to download the immediately necessary code.

Qoot takes a different approach to setting up the subscriptions. Qoot stores application state in entities. Components subscribe to entities to get notified of entity state change. The subscription creates a component-level reactive system. The subscription system gives Qoot knowledge to know when and which component should be invalidated and scheduled for re-rendering when the data store changes. This solves the issue of having to re-render the whole app on any state change. Knowing which components subscribe to which entity allows Qoot only to download and render the relevant components.

> NOTE: One could build a redux system on top of Qoot entities.

The critical difference to standard subscription system based on function closures, the Qoot subscription system is based on DOM attributes. This allows the DOM to declare relationships between entities and components without allocating and executing any subscription listeners or releasing listeners when views go away. The subscription system in Qoot is fully declarative and has no runtime overhead of setting up the relationships.

> In practice, Qoot uses `querySelectorAll` to find all listeners interested in specific state changes and only re-hydrates the listening component if the component needs to be re-rendered.

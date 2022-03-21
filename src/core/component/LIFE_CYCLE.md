[![hackmd-github-sync-badge](https://hackmd.io/bQNLF9lySvyclywmM_Bd5g/badge)](https://hackmd.io/bQNLF9lySvyclywmM_Bd5g)

# Lifecycle Hooks

Describes component lifecycle hooks.

In typical development, when discussing object lifespan, it is clear that objects either exist or they do not. Either an object has been instantiated, or it has not yet been instantiated (or it has been instantiated and has since been garbage collected. Hence it no longer exists.)

When discussing the lifespan of a Qwik component, it is necessary to expand the definition into
three states: `Void`, `dehydrated`, and `Hydrated`.

1. `Void`: Component does not exist. Nothing has been created yet. This is equivalent to an object not being instantiated or an object not existing.
2. `Hydrated`: Component exists in VM heap and can be passed around as a reference. This is equivalent to how developers normally think of objects.
3. `Dehydrated`: An in-between state between `Void` and `Hydrated`. A component has been created, but it is not represented in the VM heap as an actual object which can be passed around as a reference. In this state, the component state is serialized in the DOM/HTML but does not have the VM heap representation.

## A Typical lifecycle of a component in an SSR scenario.

1. Component is created on the server. It is in the `Hydrated` state and can be passed around by reference (the normal way of passing objects in JS.)
2. Server completes rendering and `dehydrate’s all of the components. This serializes all of the component states into the DOM attributes. Once the state is serialized in the DOM the server can convert the DOM into HTML and send the HTML to the client.
3. At this point, the VM no longer has a reference to the component instances. However, it would be incorrect to say that the component no longer exists. Instead, the component is in a `dehydrated` state. It is somewhere between non-existing and fully existing.
4. Client receives the HTML and turns it back to DOM. The DOM contains the component’s state, but the component is not yet resumed.
5. Some action is performed which requires that the component is fully resumed. It is at this point that the component can be re-created. Obviously, from the reference point, the object on the server and on the client are different instances. But logically, we can say that it is the same component.

For these reasons, it is important to differentiate between a logical component and a component instance. A logical component is a component that can span creation on the server and execution on the client. A logical component survives dehydration/rehydration events
(a component instance does not.)

To describe the whole lifecycle of the component, refer to the diagram and explanation below.

```
 logical  ||          ||  private || transient  ||        component ||
component ||   DOM    ||   state  ||   state    ||         instance ||
   JSX    ||          ||   STATE  || TRANSIENT  ||         (VM ref) ||
======================================================================
  (1)
<MyComp>      (2)
   ||      <my-comp/>                                       (3)   new
   ||          ||                                         QComponent()
   ||          ||            new               (4)                |
   ||          ||          STATE() <---------[OnMount]----------- |
   ||          ||             ||                                  |
   ||          ||             || - - - - - - - (5) - - - - - - -> ||
   ||          ||             ||      new             (6)         ||
   ||          ||             ||   TRANSIENT() <---[OnHydrate]--- ||
   ||          ||             ||       ||                         ||
   ||          ||             ||       || - - - - - -(7)- - - - > |||
   ||          ||             ||       ||                         |||
   ||          ||             ||       ||        (8)              |||
   ||       <my-comp> <=======================[OnRender]========= |||
   ||    (9)  <view/>         ||       ||                         |||
   ||       </my-comp>        ||       ||                         |||
   ||          ||             ||       ||                         |||
   ||          ||             ||  (10) ||                         |||
---------------------------- dehydrate(document) -----------------------+
   ||          ||             ||       ||                         |||   |
   ||          ||             ||       ||           (11)          |||   |
   ||          ||   (12)      ||       XX <-----[OnPause]---- XXX <-+
   ||   <my-comp {STATE}> <-- XX                                    (13)|
   ||   ===================  Serialized to HTML ===================== <-+
   ||   ==          (14)             HTTP                          ==
   ||   ===================  Deserialize from HTML  =================
   ||   <my-comp {STATE}>
   ||     <view/>   (15)
   ||   </my-comp>
   ||          ||             (16)                           (17)   new
   ||          ||             JSON                           QComponent()
   ||          || - - - - -> (parse) - - - - - - - - - - - - - - >||
   ||          ||             ||                                  ||
   ||          ||             ||      new            (18)         ||
   ||          ||             ||   TRANSIENT() <---[OnHydrate]--- ||
   ||          ||             ||       ||                         ||
   ||          ||             ||       || - - - - - (19) - - - -> |||
   ||          ||             ||       ||                         |||
   ||          ||             ||       ||                         |||
   ||          ||             ||       ||        (20)             |||
   ||       <my-comp> <=======================[OnRender]========= |||
   ||   (21)  <view/>         ||       ||                         |||
   ||       </my-comp>        ||       ||                         |||
   ||          ||             ||       ||                         |||
(removed)      ||             ||       ||            (24)         |||
  (22)  +-->(removed) ---------------------------[OnUnmount]----> |||
              (23)            ||       ||            (25)         |||
                              XX<------XX <-----[OnPause]---- XXX
```

Please match the numbers in the diagram to the explanation below.

1. A logic component is created when the parent component’s render function creates a `<MyComp>` node.
2. The result of executing the parent’s component JSX is that `<my-comp>` host-element is created in the DOM, and the`<MyComp>`’s view is scheduled for rendering.
3. Before rendering can start, the component instance needs to be created. This is equivalent to `new QComponent()`. The newly created `QComponent` is missing the private and transient state, and so it fires `[OnMount]` (and a bit later `[OnHydrate]`)
4. `[OnMount]`: Allows the `[OnMount]` hook to create the state of the component.
5. The new `STATE` is assigned into `QComponent`. This allows the `[OnHydrate]` hook to run.
6. `[OnHydrate]`: Responsible for creating `TRANSIENT` state. A transient state is a state which can’t be serialized (ie. promises, observables, closures, streams.) It is separated from `[OnMount]` because `[OnMount]` runs only once for the logical component. The application needs a way to be notified every time the component is deserialized.
7. The new `TRANSIENT` state is assigned to `QComponent`. At this point, the component is fully rehydrated and can be used for rendering or event handling.
8. `[OnRender]`: This invokes the `MyComp’s render function, which produces JSX nodes to be reconciled against the DOM.
9. The result of `[OnRender]` and reconciliation is that the `<my-comp>` host-element now contains `MyComp’s view fully rendered..
10. `dehydrate()`: At some point, the server determines that the SSR is finished and the rendered applications should be sent to the client. The first step is to serialize all of the data into the DOM. This method locates all of the components and triggers the `[OnPause]` hook.
11. `[OnPause]` is responsible for doing the reverse of `[OnHydrate]`. The method is
    responsible for releasing any resources which the `[OnHydrate]` acquired and which are stored in `TRANSIENT` state.
12. Qwik serializes the `STATE` of the component into the DOM. At this point, the `QComponent` is released and is available for garbage collection.
13. After `snapshot()` completes, the DOM can be serialized to HTML and sent to the client.
14. The client receives the HTML and deserializes it into DOM.
15. The deserialized DOM contains the `<my-comp {STATE}>` element along with its serialized state. The components are deserialized lazily. Only when `QComponent` instance is needed does it go through the deserialization process.
16. If a component is needed, it can go through a rehydration process. First, the component’s state is parsed from the DOM and passed to the `QComponent`
17. A new `QComponent` is created, and the deserialized state is assigned to it.
18. `[OnHydrate]`: `[OnHydrate]` hook runs which creates a transient state for the component. This is also a good place to recreate any non-serializable objects, such as promises, observables, closures, and streams.
19. The new `TRANSIENT` state is assigned to the `QComponent`. At this point, the `QComponent` is ready to be used in rendering.
20. `[OnRender]`: On render, the method can execute, which can create new JSX nodes.
21. The rendered DOM is updated to reflect the changes from `<MyComp>`. The update process does not force child or parent components to be re-rendered unless the update changes props of those components.
22. At some point, the parent component removes the `<MyComp>` from its JSX tree. This triggers the destroy process.
23. The DOM is updated, and `<my-comp>` is removed.
24. `[OnUnmount]`: lifecycle hook is invoked to let the component know that it is being removed.
25. `[OnPause]`: lifecycle hook is invoked to clean up the transient state of the component.

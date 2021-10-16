A lazy-loadable `QHook` reference to a component's initialization hook.

`OnMount` is invoked when the component is first created and before the component is rendered. `OnMount`s primary purpose is to create component's state. Typically the `OnRender` will use the state for rendering.

`OnMount` invokes on `QComponent` creation, but not after rehydration. When performing SSR, the `OnMount` will invoke on the server because that is where the component is created. The server then dehydrates the application and sends it to the client. On the client, the `QComponent` may be rehydrated. Rehydration does not cause a second `OnMount` invocation. (Only one invocation per component instance, regardless if the lifespan of the component starts on the server and continues on the client.)

NOTE: All lifecycle hooks can be synchronous or asynchronous.

See: `OnMount` for details.

### Example

<docs code="./q-component.docs.tsx#on-mount"/>

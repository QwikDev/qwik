---
title: Resumable vs. Replayable
---

# Resumable vs. Replayable

A key concept of Qwik applications is that they are resumable from server-side-rendered state. The best way to explain resumability is to understand how the current generation of frameworks are replayable.

## Frameworks must understand the application

Frameworks have the need to understand the structure of the application. Examples of such knowledge are:

- location of the event handlers
- understanding component structure (parent child relationship)
- bindings

We call the above information the framework-internal-state.

## Heap-centric frameworks are replayable

The current generation of frameworks store the framework-internal-state in the Javascript heap as a set of objects, and closures. The frameworks build up their internal-state by bootstrapping the application. Because the frameworks are not designed with serializability in mind, the framework-internal-state is not serializable and needs to be re-built on application bootstrap. The consequence of this is that if a site is server-side-rendered then the framework must re-bootstrap the application in order to rebuild the framework-internal-state. Bootstrapping the application is slow because:

- Most of the framework needs to be downloaded and executed.
- All component templates on the page need to be downloaded. (Proportional to the size of the application.)
- The browser must parse and execute the code (usually in slow interpreted mode as JIT has not had sufficient time to warm up).
- On bootstrap the application often performs complex initialization and data fetching.
- The newly bootstrapped application generates DOM which needs to be reconciled with the server-side-rendered DOM (usually the new DOM just replaces the SSR DOM).

The consequence of the above constraints is that the application initializes twice. Once on the server, and than once again on the client. We say that the application is **replayable** because the application must _replay_ its bootstrap on the client to get the framework-internal-state into the same state as it was on the server.

The **re-playability** property of the framework is what makes the applications built with the current generation of frameworks have less than ideal [time to interactive](https://web.dev/interactive/) performance. Usually the performance is proportional to the application size. An application may start with good time-to-interactive and as the application gets bigger its time-to-interactive performance progressively gets worse.

## DOM centric frameworks are resumable

If time-to-interactive is your top concern then you want to have a framework which is **resumable**. By **resumable** we mean that the application bootstraps on the server, gets serialized into HTML, and can continue execution on the client without re-bootstrapping itself on the client. The application simply _resumes_ from where the server left off.

In order for the framework to be resumable it must store the framework-internal-state in an easily serializable format. The most obvious location is to store framework-internal-state directly on the DOM in the form of attributes as they are serializable.

Examples of information which the framework needs to store in the DOM are:

- DOM listeners
- Component state
- Pointers to component templates for re-rendering.
- Entity state
- Entity component relationships.

By keeping the above state in the DOM the framework does not have any additional information (other than what is stored in the DOM) and as a result the framework can continue executing from where the server left off. Because the framework provides a mechanism for application component and entities to also be serialized into the DOM the result is that both the framework as well as application state can be serialized into HTML and the application can fully be resumed on the client.

## Writing applications with serializability in mind

The resumability property of the framework must extend to resumability of the application as well. This means that the framework must provide mechanisms for the developer to express Components and Entities of the applications in a way which can be serialized and then resumed (without re-bootstrapping). This necessitates that applications are written with resumability constraints in mind. It is simply not possible for developers to continue to write applications in a heap-centric way and expect that a better framework can somehow make up for this sub-optimal approach.

Developers must write their applications in a DOM-centric way. This will require a change of behavior and retooling of web-developers skills. Frameworks need to provide guidance and APIs to make it easy for developers to write the applications in this way.

## Other benefits of resumability

The most obvious benefit of using resumability is for server-side-rendering. However, there are secondary benefits:

- Serializing existing PWA apps so that users don't loose context when they return to the application
- Improved rendering performance because only changed components need to be re-rendered
- Fine-grained-lazy loading
- Decreased memory pressure, especially on mobile devices
- Progressive interactivity of existing static websites

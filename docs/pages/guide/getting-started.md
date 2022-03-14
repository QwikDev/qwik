---
title: Getting Started
---

# Getting Started

This document takes you through creating a To-do application as popularized by https://todomvc.com/. This guide assumes that you have prior knowledge of other frameworks and JSX.

## Prerequisite

- `node.js` v14 or higher (with `npm`)
- your favorite IDE

## Creating a an app

First step is to create an application. Qwik comes with a CLI that allows you to create a basic working skeleton of an application. We will use the CLI to create a Todo sample app and we will use that application to do a walk through of Qwik so that you can familiarize yourself with it.

1. Ask Qwik CLI to create a project:

```shell=
$ npm create qwik@latest
```

2. Create a an application (`qwik-todo`)

```shell=
💫 Let's create a Qwik project 💫

? Project name › qwik-todo
```

3. Select `Todo` starter project:

```shell=
? Select a starter › - Use arrow-keys. Return to submit.
    Starter - Blank Qwik starter app.
    Starter Builder
    Starter Partytown
❯   Todo
```

4. Qwik is a framework which starts on server and than moves to browser. Select serving technology:

```shell=
? Select a server › - Use arrow-keys. Return to submit.
❯   Express - Express.js server.
    Cloudflare
    Setup later
```

The resulting output should look like this:

```shell=
💫 Let's create a Qwik project 💫

✔ Project name … qwik-todo
✔ Select a starter › Todo
✔ Select a server › Express

⭐️ Success! Project saved in qwik-todo directory

📟 Next steps:
   cd qwik-todo
   npm install
   npm start
```

At this point you will have `qwik-todo` directory which contains the starter app.

## Running in client mode (development)

The easiest way to get running application is to follow the steps from the `npm create qwik@latest`:

1. Change into the directory created by the `npm create qwik@latest`.

```shell=
cd qwik-todo
```

2. Install NPM modules:

```shell=
npm install
```

3. Invoke the server

```shell=
npm start
```

4. You should see a server running with your To-do application

```shell=
  vite v2.8.6 dev server running at:

  > Local: http://localhost:3000/
  > Network: use `--host` to expose

  ready in 157ms.
```

5. Visit http://localhost:3000/ to explore the To-do app.

![](https://i.imgur.com/O72rnhe.png)

The application is running in development mode using [Vite](https://vitejs.dev/). This is a special mode that supports Hot-Module-Reloading (HMR.)

While HMR is great for development, Qwik is running like a traditional framework, where all of the work is done in the browser. If you look into the network tab of the dev-tools, you will see that all of the code is eagerly downloaded into the browser and executed. To really understand how Qwik is different we need to run in production mode to see the magic happen.

## Running in production mode

Qwik is SSR/SSG framework that can 1) start execution in `node.js` 2) can serialize the application state into HTML 3) resume the application from HTML in the browser. This section is a tour of those capabilities.

1. Build the application:

```shell=
$ npm run build
```

2. Results in output similar to this.

```shell=
> qwik-todo@0.0.0 build /Users/misko/qwik-todo
> npm run typecheck && npm run build.client && npm run build.server


> qwik-todo@0.0.0 typecheck /Users/misko/qwik-todo
> tsc --noEmit


> qwik-todo@0.0.0 build.client /Users/misko/qwik-todo
> vite build --outDir server/public

vite v2.8.6 building for production...
✓ 34 modules transformed.
server/public/index.html                 0.37 KiB
server/public/assets/main.81a5c326.js    0.20 KiB / gzip: 0.15 KiB
server/public/assets/index.9d3fa03a.js   0.25 KiB / gzip: 0.18 KiB
server/public/q-b5deaed3.js              0.67 KiB / gzip: 0.42 KiB
server/public/q-cc9047c3.js              5.08 KiB / gzip: 1.47 KiB
server/public/q-3a2b0629.css             6.65 KiB / gzip: 2.07 KiB
server/public/q-59136a66.js              39.29 KiB / gzip: 13.07 KiB

> qwik-todo@0.0.0 build.server /Users/misko/qwik-todo
> vite build --outDir server/build --ssr src/entry.express.tsx

vite v2.8.6 building SSR bundle for production...
✓ 30 modules transformed.
server/build/entry.express.js   13.23 KiB
```

There are three parts to the build:

1. TypeScript compilation which is performed with `tsc`.
2. Bundling for the client
3. Bundling for the server

Because Qwik applications start their execution on the server and than resume on the client, it is necessary to bundle the application twice. There are few reason for this:

1. Browser want ES modules, whereas `node.js` run better with commonJS.
2. Browser need to take advantage of lazy loading and therefore browsers need many small files. Servers are long running so lazy loading does not have benefit.
3. Server code may execute different functions which allow server to make direct connections to databases etc..

For those reasons the bundling step is performed twice.

After successful build the application can be served as it would be served in production:

```shell=
$ npm run serve
```

Output:

```shell=
> qwik-todo@0.0.0 serve /Users/misko/qwik-todo
> node server/build/entry.express.js

http://localhost:8080/
```

We can now see application running by visiting http://localhost:8080/.

## Tour of production

At this point it is important to take a tour of the To-do application to understand main differences with current generation of frameworks. Understanding the differences will give you better insight behind many technical decisions of the framework.

1. First visit http://localhost:8080/ to familiarize yourself with the To-do application and convince yourself that the application is working as expected.

NOTE: for the next steps it is recomended that you open the application in incognito window, as many browser extensions inject code into sites which may make it look like Javascript is being downloaded.

2. Open the networking tap in DevTools in your browser and notice that the application did not download any JavaScript to startup. And yet the application is fully interactive. We call this property resumability and it is the main feature of Qwik that allows even the most complex applications to start up instantaiously.
   ![](https://i.imgur.com/QVyu5OX.png)

3. The question to answer is how is it possible for the application to be interactive with no Javascript. The answer is that Qwik applications come with a small Qwikloader. The Qwikloader is very small, less than 1kB, and therefore is inlined directly into `index.html` to save on round trip cost. The Qwikloader is responsible for setting up global event listeners for the application and than downloading the application code on user interaction.

4. The Qwikloader is responsible for setting up global event listeners to make the application interactive. Open the DevTools Performance tab and profile the application. What you should see is that the Qwikloader should execute in about 10 ms. (Note: this can be further reduced by explicitly limiting the events to listen to.)

![](https://i.imgur.com/bnnCd2L.png)

To resume a Qwik application it takes less than 1kB of Javascript which then executes on the client in about 10 ms. The thing to understand is that this code is no way specific to the To-do application. The cost described above is fixed no matter the size or complexity of the application. Current generation frameworks must hydrate the application on client to make it interactive. This requires downloading the framework and the application. The hydration cost is proportional to the size and complexity of the application. So it may start out small, but as the application grows so will the hydration cost. With Qwik the startup cost is 1) significantly smaller and 2) is fixed no matter the complexity of the application.

## Understanding User Interactions

## Understanding SSR/SSG

## Understanding Serialization and Resumability

## Writing a component

## Configuring Optimizer

---

## `dev.ssr`

NOTE: There is also `npm run dev.ssr` move which retains Vite and some of the HMR functionality, but Qwik starts on server and is resumed on the client.

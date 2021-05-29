# QRL

QRL is Qwik-URL. It is a URL which contains custom protocols which is understood by Qwik. All QRLs are syntactically valid URLs, however QRLs have custom protocols and so can't be used directly by the browser.

## Protocol

Javascript supports importing code through `import('./some_path')` function. The `import` function performs the `./some_path` import relative to the file where the `import()` function was invoked from. Normally this works great. The problem is that if the `import()` is in the framework code than all relative paths need to be relative to the framework.

The relative nature of the `import()` statement is problematic when composing applications.

Assume this HTML:

```html
<button on:click="./handle_click"></button>
```

1. First the QRLs are often embedded in HTML. In such a case the relative nature should be from HTML not from the framework. However the HTML URL often has custom URL due to routing, and so really URL has nothing to do with where the actual location of the code resides.
2. To compose libraries, the library author does not know how the files will be layed out (or bundled) on the application server. So there needs to be a way to reefer to resources but give the configuration to the application developer.

For the above two reasons relative imports just don't make much sense in Qwik and should be avoided. Instead we need to use absolute URLs. However sprinkling absolute URLs all over the code base is equally problematic as it makes the code hard to refactor or move.

```html
<button on:click="http://myserver.com/app/handle_click"></button>
```

Protocols solve this problem. Protocols allow the developer to express an absolute URL in a configurable format.

```html
<button on:click="myApp:/handle_click"></button>
```

The above says that the `/handle_click` can be found relative to `myApp:`. This requires that application developer can configure `myApp:`. The configuration needs to be done on server as well as on browser.

### Browser protocol configuration

```html
<script>
  let Q = {
    protocol: {
      myApp: 'http://myserver.com/app',
    },
  };
</script>
```

The above global configuration simply says that `myApp:/handle_click` should be translated to `http://myserver.com/app/handle_click`. Notice that all which is needed to configure the protocol is declaration of `Q` property on global namespace such as `window`.

### Server protocol configuration

Configuring protocol on the server serves the same purpose as on the client, but is a bit more complicated because a single server can serve multiple applications and therefore is contextual.

As a convention create a `CONFIG.ts` file in a directory which will control protocols in that directory and its subdirectories.

```typescript
import { setConfig } from './index.js';

setConfig({
  baseURI: import.meta.url,
  protocol: {
    myApp: 'http://myserver.com/app',
  },
});
```

The important part is the `baseURI` which gets set to the obsolete URL of this file (`import.meta.url` returns `file://path/to/CONFIG.js`.) This will tell Qwik to resolve all files which come from a `file://path/to/**` folder using this configuration.

It is important that you import the `CONFIG.ts` file someplace from the root of the application so that the protocols can get configured before they are used.

## File extension

When Qwik imports a QRL it always imports it with a `.js` extension.

## Search Parameters

## Declaring QRLs in code

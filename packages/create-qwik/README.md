# Create Qwik ⚡️

## Interactive mode

```
npm create qwik@latest
```

## Command mode

```
npm create qwik@latest <starter> <projectName>
```

## API

```javascript
const { createApp } = require('create-qwik');

const opts = {
  projectName: 'my-project',
  starterId: 'todo',
  outDir: '/path/to/output/dir',
};

const result = await createApp(opts);
console.log(result);
```

## Community

- Ping us at [@QwikDev](https://twitter.com/QwikDev)
- Join our [Discord](https://qwik.dev/chat) community

## Related

- [Qwik](https://qwik.dev/)
- [Partytown](https://partytown.builder.io)
- [Mitosis](https://github.com/BuilderIO/mitosis)
- [Builder.io](https://github.com/BuilderIO/)

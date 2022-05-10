# Create Qwik

## Interactive mode

```
npm init qwik@latest
```

## Command mode

```
npm init qwik@latest <starter> <projectName>
```

#### Example:

```
npm init qwik@latest todo my-app
```

## API

```javascript
const { getStarters, generateStarter } = require('create-qwik');

const starters = await getStarters();
console.log(starters);

const opts = {
  projectName: 'my-project',
  appId: 'todo',
  serverId: 'express',
  outDir: '/path/to/output/dir',
  featureIds: [],
};

const result = await generateStarter(opts);
console.log(result);
```

## Community

- Ping us at [@QwikDev](https://twitter.com/QwikDev)
- Join our [Discord](https://qwik.builder.io/chat) community.
- Join our [weekly office hours](https://calendar.google.com/calendar/u/0?cid=Y180ZG91YjR2NTZ1cW43YmgzbW1oZGJ2M3R2c0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t)

## Related

- [Qwik](https://qwik.builder.io/)
- [Partytown](https://partytown.builder.io)
- [Mitosis](https://github.com/BuilderIO/mitosis)
- [Builder.io](https://github.com/BuilderIO/)

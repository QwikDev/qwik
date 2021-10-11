# `eslint-plugin-qwik`

## Installation

```sh
# npm
npm install eslint-plugin-qwik --save-dev

# yarn
yarn add eslint-plugin-qwik --dev
```

## Configuration

ESLint supports configuration files in several [formats](https://eslint.org/docs/user-guide/configuring/configuration-files#configuration-file-formats).

### .eslintrc.js

```js
{
  "plugins": [
    // ...
    "qwik"
  ],
  "rules": {
    // ...
    'qwik/no-closed-over-variables': 'error',
  }
}
```

## License

MIT

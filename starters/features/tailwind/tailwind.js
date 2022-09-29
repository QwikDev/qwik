const fs = require('fs');
const path = require('path');
const { bold, green } = require('kleur');

const GLOBAL_CSS_PATH = path.join(__dirname, 'src', 'global.css');

const globalRaw = fs.readFileSync(GLOBAL_CSS_PATH).toString().split('\n');

const addTailwindInGlobal = () => {
  globalRaw.splice(0, 0, '@tailwind base; \n@tailwind components; \n@tailwind utilities;');

  const globalRawUpdate = globalRaw.join('\n');
  fs.writeFile(GLOBAL_CSS_PATH, globalRawUpdate, function (err) {
    if (err) return console.log(err);
  });

  fs.unlinkSync('./tailwind.js');
};

addTailwindInGlobal();
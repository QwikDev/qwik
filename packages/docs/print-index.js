const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'index.html');
const index = fs.readFileSync(indexPath, 'utf8');
console.log(index);

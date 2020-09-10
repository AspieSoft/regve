const miniforge = require('miniforge-js');

miniforge.rootDir(__dirname);

miniforge.build('./main.js', {outputNameMin: true});

console.log('Finished Build');

const app = require('./index');
const test = require('./test/test');
test(app);

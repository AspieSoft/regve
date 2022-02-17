// const app = require('../main');
const app = require('../main.min');
const test = require('./test');
test(app);
setTimeout(function(){process.exit(0);}, 5000);

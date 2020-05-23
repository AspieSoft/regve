const app = require('../main.min');
const test = require('./test');
test(app);
setTimeout(function(){process.exit(0);}, 1000);

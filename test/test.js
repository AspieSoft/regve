function runTest(regve){

	const http = require('http');
	const fs = require('fs');

	regve({
    dir: __dirname,
    template: 'template',
    extract: ['style'],
    keepInvalidVars: false,
    opts: {static: '/cdn'},
  });

	function onRequest(req, res){
		if(req.url !== '/'){
			res.writeHead(404, {'Content-Type': 'text/html'});
			res.write('404');
			res.end(); return;
		}
		res.writeHead(200, {'Content-Type': 'text/html'});
		fs.readFile('./test/example.html', function(err, content){
			if(err){
				res.writeHead(404, {'Content-Type': 'text/html'});
				res.write('404');
			}else{
				content = regve.render(content, {
          script: '<script>console.log("test")</script>',
          list1: ['item 1', 'item 2', 'item 3'], list2: ['item 4', 'item 5', 'item 6'], title: 'test', menus: {main: [{url: '/', name: 'Home'}, {url: '/youtube', name: 'YouTube'}], sub: [{url: '/video', name: 'Video'}]}
        });
				res.write(content);
			}
			res.end();
		});
	}

	http.createServer(onRequest).listen(8080);

}

module.exports = runTest;

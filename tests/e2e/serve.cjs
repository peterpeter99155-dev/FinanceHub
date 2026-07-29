const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '../../.webpack/e2e-browser');
const indexPath = path.join(__dirname, 'index.html');

createServer((request, response) => {
  const requestedPath =
    request.url === '/bundle.js' ? path.join(root, 'bundle.js') : indexPath;
  response.setHeader(
    'Content-Type',
    request.url === '/bundle.js'
      ? 'application/javascript; charset=utf-8'
      : 'text/html; charset=utf-8',
  );
  createReadStream(requestedPath)
    .on('error', () => {
      response.statusCode = 404;
      response.end('Not found');
    })
    .pipe(response);
}).listen(4173, '127.0.0.1');

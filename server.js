/* ============================================
   TagineLake - Local Preview Server
   Zero-dependency Node http server
   Usage: node server.js [port]
   ============================================ */
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = parseInt(process.argv[2]) || 3000;
var ROOT = __dirname;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8'
};

var server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Support POST for local testing of comments
  if (req.method === 'POST') {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      // Mock comment storage in memory
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true, id: Date.now().toString(), mock: true }));
    });
    return;
  }

  var filePath = path.join(ROOT, urlPath);
  // Prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Directory → index.html (so /easy/ and /hard/ resolve, matching production)
  try {
    var st = fs.statSync(filePath);
    if (st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) { /* fall through to readFile → 404 if missing */ }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log('TagineLake preview server running at http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
});

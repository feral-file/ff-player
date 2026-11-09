export const textDrawing = '\n▌▌▌  ▀▀▀\n▌ ▌  ▀ ▀\n▌▌▌  ▀▀▀\n';
export const directorySource =
  'http://127.0.0.1:8080/ipfs/QmSeed?fxhash=ooSeed&space=%20#work';

/** Reproduce transparent native text and a gateway redirect that drops its query. */
export function serveContentFixture(url, response) {
  if (url.pathname === '/drawing.txt') {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(textDrawing);
    return true;
  }
  if (url.pathname === '/transparent.html') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<body style="margin:0"><div style="width:100px;height:100px;background:lime"></div></body>'
    );
    return true;
  }
  if (url.pathname === '/ipfs/QmSeed') {
    response.writeHead(301, { Location: '/ipfs/QmSeed/' });
    response.end();
    return true;
  }
  if (url.pathname === '/ipfs/QmSeed/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><body><script>
      const fxhash = new URLSearchParams(location.search).get('fxhash');
      const seed = fxhash.slice(2);
      document.body.style.background = seed === 'Seed' ? '#36aa77' : '#ee0000';
      document.body.textContent = seed;
    </script></body>`);
    return true;
  }
  // Reproduce exact-key replay of a captured directory redirect. Only the
  // original query-bearing source and queryless destination were captured.
  if (url.pathname === '/ipfs/QmCached') {
    response.writeHead(301, { Location: '/ipfs/QmCached/' });
    response.end();
    return true;
  }
  if (url.pathname === '/ipfs/QmCached/') {
    if (url.searchParams.has('edition')) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Uncaptured resource');
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<body>Cached artwork</body>');
    }
    return true;
  }
  return false;
}

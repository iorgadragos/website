// CloudFront Function (viewer request, runtime cloudfront-js-2.0).
// The DOMAIN placeholder (two underscores each side) is replaced at synth time (see site-stack.ts). Unit-tested in test/rewrite.test.ts.
function handler(event) {
  var req = event.request;
  var host = req.headers.host && req.headers.host.value;
  if (host === 'www.__DOMAIN__') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://__DOMAIN__' + req.uri + queryString(req.querystring) } },
    };
  }
  var uri = req.uri;
  var last = uri.split('/').pop();
  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  } else if (!/\.[a-z0-9]{1,5}$/i.test(last)) {
    // Pretty URL (/about, /blog/node.js-tips) → its index.html; real files (/favicon.svg, /rss.xml) pass through.
    req.uri = uri + '/index.html';
  }
  return req;
}

function queryString(qs) {
  var parts = [];
  for (var key in qs) {
    var entry = qs[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

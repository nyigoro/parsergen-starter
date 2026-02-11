const fs = require('fs');
const path = require('path');

const docsDir = path.join(process.cwd(), 'docs');
const target = path.join(docsDir, '404.html');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Redirecting…</title>
    <meta http-equiv="refresh" content="0; url=./">
    <script>
      (function () {
        var redirect = location.origin + '/#' + location.pathname + location.search + location.hash;
        location.replace(redirect);
      })();
    </script>
  </head>
  <body>
    Redirecting…
  </body>
</html>
`;

if (!fs.existsSync(docsDir)) {
  console.error('docs/ does not exist. Run the UI build first.');
  process.exit(1);
}

fs.writeFileSync(target, html, 'utf8');
console.log('Wrote docs/404.html');

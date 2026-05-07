const fs = require('fs');
const path = require('path');

function trimAppSuffix(pathname) {
  return pathname.replace(/\/404\.html$/i, '').replace(/\/+$/g, '');
}

function buildDocsRedirect(origin, pathname) {
  const cleaned = trimAppSuffix(pathname);
  const marker = '/docs';
  const markerIndex = cleaned.indexOf(marker);
  const prefix = markerIndex >= 0 ? cleaned.slice(0, markerIndex) : '';
  const afterMarker = markerIndex >= 0 ? cleaned.slice(markerIndex + marker.length) : '';
  const slug = afterMarker.replace(/^\/+/, '');
  const base = `${origin}${prefix}${marker}/`;
  return slug.length > 0 ? `${base}#/${slug}` : base;
}

function buildPlaygroundRedirect(origin, pathname, search = '', hash = '') {
  const cleaned = trimAppSuffix(pathname);
  const marker = '/playground';
  const markerIndex = cleaned.indexOf(marker);
  const prefix = markerIndex >= 0 ? cleaned.slice(0, markerIndex) : '';
  return `${origin}${prefix}${marker}/${search}${hash}`;
}

function buildRootRedirect(origin, pathname) {
  const cleaned = trimAppSuffix(pathname);
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return `${origin}/${segments[0]}/`;
  }
  return `${origin}/`;
}

function computeRedirectUrl({ origin, pathname, search = '', hash = '' }) {
  const normalizedPath = pathname || '/';
  if (normalizedPath.includes('/docs/')) {
    return buildDocsRedirect(origin, normalizedPath);
  }
  if (normalizedPath.includes('/playground/')) {
    return buildPlaygroundRedirect(origin, normalizedPath, search, hash);
  }
  return buildRootRedirect(origin, normalizedPath);
}

function build404Html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Redirecting...</title>
    <meta http-equiv="refresh" content="0; url=./">
    <script>
      (function () {
        function trimAppSuffix(pathname) {
          return pathname.replace(/\\/404\\.html$/i, '').replace(/\\/+$/g, '');
        }

        function buildDocsRedirect(origin, pathname) {
          var cleaned = trimAppSuffix(pathname);
          var marker = '/docs';
          var markerIndex = cleaned.indexOf(marker);
          var prefix = markerIndex >= 0 ? cleaned.slice(0, markerIndex) : '';
          var afterMarker = markerIndex >= 0 ? cleaned.slice(markerIndex + marker.length) : '';
          var slug = afterMarker.replace(/^\\/+/, '');
          var base = origin + prefix + marker + '/';
          return slug.length > 0 ? base + '#/' + slug : base;
        }

        function buildPlaygroundRedirect(origin, pathname, search, hash) {
          var cleaned = trimAppSuffix(pathname);
          var marker = '/playground';
          var markerIndex = cleaned.indexOf(marker);
          var prefix = markerIndex >= 0 ? cleaned.slice(0, markerIndex) : '';
          return origin + prefix + marker + '/' + search + hash;
        }

        function buildRootRedirect(origin, pathname) {
          var cleaned = trimAppSuffix(pathname);
          var segments = cleaned.split('/').filter(Boolean);
          if (segments.length >= 2) {
            return origin + '/' + segments[0] + '/';
          }
          return origin + '/';
        }

        function computeRedirectUrl(locationValue) {
          var pathname = locationValue.pathname || '/';
          if (pathname.includes('/docs/')) {
            return buildDocsRedirect(locationValue.origin, pathname);
          }
          if (pathname.includes('/playground/')) {
            return buildPlaygroundRedirect(locationValue.origin, pathname, locationValue.search || '', locationValue.hash || '');
          }
          return buildRootRedirect(locationValue.origin, pathname);
        }

        location.replace(computeRedirectUrl(location));
      })();
    </script>
  </head>
  <body>
    Redirecting...
  </body>
</html>
`;
}

function write404File() {
  const repoRoot = path.resolve(__dirname, '..');
  const docsDir = path.join(repoRoot, 'docs');
  const target = path.join(docsDir, '404.html');

  if (!fs.existsSync(docsDir)) {
    throw new Error('docs/ does not exist. Run the UI build first.');
  }

  fs.writeFileSync(target, build404Html(), 'utf8');
  return target;
}

module.exports = {
  build404Html,
  computeRedirectUrl,
};

if (require.main === module) {
  try {
    const target = write404File();
    console.log(`Wrote ${path.relative(path.resolve(__dirname, '..'), target)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

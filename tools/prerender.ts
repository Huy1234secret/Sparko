import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist');
const requireWeb = createRequire(join(root, 'apps/web/package.json'));
const { createServer } = await import(
  pathToFileURL(requireWeb.resolve('vite')).href
);
let template = await readFile(join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  template = (await readFile(join(dist, 'app.html'), 'utf8')).replace(
    '<meta name="robots" content="noindex,nofollow">',
    '',
  );
}
const server = await createServer({
  root: join(root, 'apps/web'),
  configFile: join(root, 'apps/web/vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
});
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const origin = 'https://panel.coin-sprite.com';

try {
  const renderer = (await server.ssrLoadModule('/prerender.tsx')) as {
    publicPages: Array<{ path: string; title: string; description: string }>;
    renderPublicPage: (path: string) => string;
  };
  // SSR asset references use source file URLs. Publish those bytes under content hashes,
  // never local paths; this also covers assets inlined by the browser build.
  const assets = new Map<string, string>();
  for (const page of renderer.publicPages) {
    let content = renderer.renderPublicPage(page.path);
    for (const match of content.matchAll(/file:\/\/[^"<>\s]+/g)) {
      const sourceUrl = match[0];
      if (!assets.has(sourceUrl)) {
        const source = fileURLToPath(sourceUrl);
        if (!source.startsWith(join(root, 'packages/assets/media/')))
          throw new Error('Unexpected local path in public rendering.');
        const data = await readFile(source);
        const name =
          createHash('sha256').update(data).digest('hex').slice(0, 16) +
          '-' +
          basename(source);
        await writeFile(join(dist, 'assets', name), data);
        assets.set(sourceUrl, '/assets/' + name);
      }
      content = content.replaceAll(sourceUrl, assets.get(sourceUrl)!);
    }
    if (!/<h1(?:\s|>)/.test(content))
      throw new Error('Public route has no rendered heading: ' + page.path);
    const canonical = origin + page.path;
    const meta = `<meta name="robots" content="index,follow"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escape(page.title)} · Sparko"><meta property="og:description" content="${escape(page.description)}"><meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Sparko — a little spark for your community"><meta name="twitter:card" content="summary_large_image">`;
    const html = template
      .replace(
        /<title>[\s\S]*?<\/title>/,
        `<title>${escape(page.title)} · Sparko</title>`,
      )
      .replace(
        /<meta\s+name="description"[\s\S]*?>/,
        `<meta name="description" content="${escape(page.description)}">`,
      )
      .replace('</head>', meta + '</head>')
      .replace(/<div id="root"><\/div>/, `<div id="root">${content}</div>`);
    const target =
      page.path === '/'
        ? join(dist, 'index.html')
        : join(dist, page.path.slice(1), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  // Private-route fallback starts with no public prerender and no indexing metadata.
  await writeFile(
    join(dist, 'app.html'),
    template.replace(
      '</head>',
      '<meta name="robots" content="noindex,nofollow"></head>',
    ),
  );
  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${renderer.publicPages.map((page) => `<url><loc>${origin}${page.path}</loc></url>`).join('')}</urlset>\n`,
  );
  const scripts = [
    ...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
  ]
    .map((match) => match[1]!)
    .filter((script) => script.trim());
  const hashes = scripts
    .map(
      (script) =>
        `'sha256-${createHash('sha256').update(script).digest('base64')}'`,
    )
    .join(' ');
  await writeFile(
    join(dist, 'security-headers.conf'),
    `add_header X-Content-Type-Options nosniff always;\nadd_header Referrer-Policy strict-origin-when-cross-origin always;\nadd_header Content-Security-Policy "default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net data: blob:; font-src 'self'; connect-src 'self' wss://panel.coin-sprite.com; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com" always;\n`,
  );
  console.log(
    `Prerendered ${renderer.publicPages.length} public routes; generated sitemap and CSP hashes.`,
  );
} finally {
  await server.close();
}
if (!(await readdir(join(dist, 'assets'))).length)
  throw new Error('Production web assets are missing.');

import { builtinModules } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPackages =
  /^@sparko\/(?:db|domain|config|observability|rendering)(?:\/|$)|^@prisma\/|^(?:discord\.js|bullmq|ioredis|pg)(?:\/|$)/;
const nodes = new Set(builtinModules.flatMap((name) => [name, 'node:' + name]));
const serverPath =
  /^(?:apps\/(?:api|bot|worker)\/|packages\/(?:db|domain|config|observability|rendering)\/)/;
const secretNames = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'SESSION_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AI_API_KEY',
];
const forbidden =
  /DISCORD_BOT_TOKEN|DISCORD_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|PrismaClient|pg_advisory_xact_lock/;
const checked = new Set<string>();
async function scan(path: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'generated'].includes(entry.name))
        out.push(...(await scan(target)));
    } else out.push(target);
  }
  return out;
}
const configPath = join(root, 'apps/web/tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error('Cannot read web TypeScript configuration.');
const options = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  dirname(configPath),
).options;
async function checkSource(file: string): Promise<void> {
  if (checked.has(file)) return;
  checked.add(file);
  const label = relative(root, file).replaceAll('\\', '/');
  if (serverPath.test(label))
    throw new Error('Browser imports server source: ' + label);
  const source = await readFile(file, 'utf8');
  if (/process\s*\.\s*env/.test(source) || forbidden.test(source))
    throw new Error('Secret/runtime boundary violated in ' + label);
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    )
      imports.push(node.moduleReference.expression.text);
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const value = node.arguments[0];
      if (!value || !ts.isStringLiteral(value))
        throw new Error(
          'Browser import must use a literal module path: ' + label,
        );
      imports.push(value.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  for (const name of imports) {
    if (
      nodes.has(name) ||
      name.startsWith('node:') ||
      serverPackages.test(name)
    )
      throw new Error('Browser imports server module ' + name + ' in ' + label);
    const result = ts.resolveModuleName(
      name,
      file,
      options,
      ts.sys,
    ).resolvedModule;
    if (
      result &&
      !result.resolvedFileName.includes('/node_modules/') &&
      /\.[cm]?[jt]sx?$/.test(result.resolvedFileName)
    )
      await checkSource(result.resolvedFileName);
  }
}
const files = (await scan(join(root, 'apps/web/src'))).filter(
  (file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(?:test|spec)\./.test(file),
);
for (const file of files) await checkSource(file);
const secretValues = secretNames
  .map((name) => process.env[name])
  .filter((value): value is string =>
    Boolean(value && value.length >= 16 && !value.startsWith('replace-')),
  );
for (const file of await scan(join(root, 'apps/web/dist'))) {
  if (!/\.(?:[cm]?js|map|html|json|css)$/.test(file)) continue;
  const source = await readFile(file, 'utf8');
  if (
    forbidden.test(source) ||
    secretValues.some((value) => source.includes(value)) ||
    /file:\/\/\/workspace\//.test(source)
  )
    throw new Error('Server-only material found in ' + relative(root, file));
}
console.log(
  `Browser boundary passed: ${checked.size} source modules and production assets checked, including transitive workspace imports.`,
);

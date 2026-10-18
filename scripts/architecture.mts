import ts from 'typescript';
import path from 'node:path';
import { readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const layers = new Set(['content', 'domain', 'platform', 'rendering', 'ui', 'app']);
const browserGlobals = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'globalThis',
  'location', 'history', 'screen', 'self', 'caches', 'indexedDB', 'fetch',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'alert', 'confirm', 'prompt',
  'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'Image', 'Audio',
  'KeyboardEvent', 'PointerEvent', 'Gamepad', 'GamepadEvent', 'Window', 'Document', 'Navigator',
]);
const normalize = (filename: string): string => path.posix.normalize(filename.replaceAll('\\', '/')).replace(/^\.\//, '');
const layerOf = (filename: string): string => filename.split('/')[1] ?? '';
const generatedManifest = (filename: string, source: string): boolean => filename === 'src/content/manifest.ts' && /^\s*\/\/\s*Generated\b/i.test(source);
const lineCount = (source: string): number => source.split(/\r?\n/).length;

function dependencyAllowed(from: string, to: string, typeOnly: boolean): boolean {
  const sourceLayer = layerOf(from), targetLayer = layerOf(to);
  if (!layers.has(sourceLayer) || !layers.has(targetLayer)) return false;
  if (sourceLayer === 'app') return true;
  if (sourceLayer === targetLayer) return true;
  if (targetLayer === 'content') return true;
  if (targetLayer === 'domain') return sourceLayer !== 'content';
  return sourceLayer === 'ui' && to.startsWith('src/platform/input/') && (typeOnly || to === 'src/platform/input/mapping.ts');
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) ||
    ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)) && parent.name === node) ||
    ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent);
}

export function inspectArchitecture(input: Record<string, string>): string[] {
  const files = new Map(Object.entries(input).map(([filename, source]) => [normalize(filename), source]));
  const errors: string[] = [];
  const graph = new Map<string, Set<string>>();
  for (const [filename, source] of files) {
    if (!filename.startsWith('src/')) continue;
    if (/\.[cm]?jsx?$/.test(filename)) errors.push(`${filename}: source JavaScript is forbidden`);
    if (!layers.has(layerOf(filename))) errors.push(`${filename}: unknown layer`);
    if (!generatedManifest(filename, source) && lineCount(source) > 350) errors.push(`${filename}: exceeds 350 source lines (${lineCount(source)})`);
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edges = new Set<string>();
    graph.set(filename, edges);
    const fail = (node: ts.Node, message: string): void => {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      errors.push(`${filename}:${line}: ${message}`);
    };
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
        const comment = scanner.getTokenText();
        for (const directive of ['@ts-ignore', '@ts-nocheck', '@ts-expect-error']) if (comment.includes(directive)) errors.push(`${filename}: ${directive} is forbidden`);
      }
    }
    function dependency(node: ts.Node, specifier: string, typeOnly = false): void {
      if (!specifier.startsWith('.')) {
        if (layerOf(filename) === 'content' && specifier === 'zod') return;
        fail(node, `external dependency forbidden: ${specifier}`);
        return;
      }
      const target = normalize(path.posix.join(path.posix.dirname(filename), specifier));
      if (layerOf(filename) === 'content' && target.startsWith('content/') && target.endsWith('.json')) return;
      const base = target.replace(/\.(?:[cm]?[jt]s)$/, '');
      const resolved = [target, `${base}.ts`, `${base}.mts`, `${target}/index.ts`, `${base}.d.ts`].find(candidate => files.has(candidate));
      if (!resolved) {
        fail(node, `unresolved dependency: ${specifier}`);
        return;
      }
      if (!dependencyAllowed(filename, resolved, typeOnly)) fail(node, `forbidden dependency: ${specifier}`);
      if (resolved.startsWith('src/')) edges.add(resolved);
    }
    function visit(node: ts.Node): void {
      if (node.kind === ts.SyntaxKind.AnyKeyword) fail(node, 'explicit any is forbidden');
      if ((layerOf(filename) === 'domain' || layerOf(filename) === 'content') && ts.isIdentifier(node) && browserGlobals.has(node.text) && !isPropertyName(node)) fail(node, `browser global forbidden: ${node.text}`);
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        let typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly === true : node.isTypeOnly;
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const bindings = node.importClause.namedBindings.elements;
          typeOnly ||= !node.importClause.name && bindings.length > 0 && bindings.every(binding => binding.isTypeOnly);
        }
        if (specifier && ts.isStringLiteral(specifier)) dependency(node, specifier.text, typeOnly);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) dependency(node, node.argument.literal.text, true);
      if (ts.isImportEqualsDeclaration(node)) fail(node, 'import-equals execution is forbidden');
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined;
        if (callee === 'eval' || callee === 'Function' || callee === 'require') fail(node, `${callee} execution is forbidden`);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (!argument || !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) fail(node, 'nonliteral dynamic import is forbidden');
        else dependency(node, argument.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const complete = new Set<string>(), active = new Set<string>(), trail: string[] = [];
  function cycle(filename: string): void {
    if (active.has(filename)) {
      errors.push(`dependency cycle: ${[...trail.slice(trail.indexOf(filename)), filename].join(' -> ')}`);
      return;
    }
    if (complete.has(filename)) return;
    active.add(filename); trail.push(filename);
    for (const target of graph.get(filename) ?? []) cycle(target);
    trail.pop(); active.delete(filename); complete.add(filename);
  }
  for (const filename of graph.keys()) cycle(filename);
  return errors;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files: Record<string, string> = {};
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const filename = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await scan(filename);
      else if (/\.[cm]?[jt]sx?$/.test(filename)) files[filename] = await readFile(path.join(root, filename), 'utf8');
    }
  }
  await scan('src');
  const errors = inspectArchitecture(files);
  for (const legacy of ['game.js', 'core.js']) {
    if (await access(path.join(root, legacy)).then(() => true, () => false)) errors.push(`${legacy}: legacy root game module is forbidden`);
  }
  for (const [filename, source] of Object.entries(files)) {
    const count = lineCount(source);
    if (count > 300 && count <= 350 && !generatedManifest(filename, source)) console.warn(`Warning: ${filename} has ${count} lines; split before 350.`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Architecture checks passed (${Object.keys(files).length} modules).`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();

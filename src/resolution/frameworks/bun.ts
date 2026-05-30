/**
 * Bun Runtime Framework Resolver
 *
 * Handles Bun-specific APIs: Bun.serve(), Bun.file(), bunx scripts,
 * Bun plugins, Bun test runner, and Elysia (popular Bun web framework).
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const bunResolver: FrameworkResolver = {
  name: 'bun',
  // Bun supports all JS/TS file types
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    // Check for bun.lockb
    if (context.fileExists('bun.lockb') || context.fileExists('bun.lock')) {
      return true;
    }

    // Check package.json for elysia or bun
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['elysia'] || deps['@elysiajs/eden'] || deps['bun-types']) {
          return true;
        }
      } catch {
        // Invalid JSON
      }
    }

    // Check for bunfig.toml
    if (context.fileExists('bunfig.toml')) {
      return true;
    }

    // Check for Bun.serve() usage in entry files
    const entryFiles = ['index.ts', 'index.js', 'server.ts', 'server.js', 'app.ts', 'app.js'];
    for (const entry of entryFiles) {
      const content = context.readFile(entry);
      if (content && (content.includes('Bun.serve(') || content.includes('new Elysia'))) {
        return true;
      }
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Elysia route handlers
    if (ref.referenceName.endsWith('Handler') || ref.referenceName.endsWith('Controller')) {
      const candidates = context.getNodesByName(ref.referenceName);
      const fn = candidates.find((n) => n.kind === 'function' || n.kind === 'class');
      if (fn) return { original: ref, targetNodeId: fn.id, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Bun plugins
    if (ref.referenceName.endsWith('Plugin')) {
      const candidates = context.getNodesByName(ref.referenceName);
      const fn = candidates.find((n) => n.kind === 'function' || n.kind === 'variable' || n.kind === 'constant');
      if (fn) return { original: ref, targetNodeId: fn.id, confidence: 0.8, resolvedBy: 'framework' };
    }

    return null;
  },

  extract(filePath: string, content: string) {
    if (
      !filePath.endsWith('.ts') &&
      !filePath.endsWith('.tsx') &&
      !filePath.endsWith('.js') &&
      !filePath.endsWith('.jsx')
    ) {
      return { nodes: [], references: [] };
    }

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const lang = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript';

    // Bun.serve() routes - extract fetch handler
    // Bun.serve({ port: 3000, fetch(req) { ... } })
    const bunServeRe = /Bun\.serve\s*\(\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = bunServeRe.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `bun-server:${filePath}:${line}`,
        kind: 'function',
        name: 'Bun.serve',
        qualifiedName: `${filePath}::Bun.serve`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      });
    }

    // Elysia routes: app.get('/path', handler), app.post('/path', handler), etc.
    const elysiaRouteRe = /\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]*)['"`]\s*,\s*(?:async\s*)?\(?/g;
    while ((m = elysiaRouteRe.exec(content)) !== null) {
      // Only if this file uses Elysia
      if (!content.includes('Elysia') && !content.includes('elysia')) break;
      const method = m[1]!.toUpperCase();
      const routePath = m[2]!;
      const line = content.slice(0, m.index).split('\n').length;

      const routeNode: Node = {
        id: `route:${filePath}:${line}:${method}:${routePath}`,
        kind: 'route',
        name: `${method} ${routePath}`,
        qualifiedName: `${filePath}::${method}:${routePath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      };
      nodes.push(routeNode);

      // Try to find inline handler reference
      const tail = content.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const refMatch = tail.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/);
      if (refMatch) {
        references.push({
          fromNodeId: routeNode.id,
          referenceName: refMatch[1]!,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: lang,
        });
      }
    }

    return { nodes, references };
  },
};

/**
 * Ktor Framework Resolver (Kotlin)
 *
 * Handles Ktor server routes for Kotlin backend applications.
 * Extracts: HTTP verb routes, route groups, Application.module entry points,
 * and @Resource type-safe routing (Ktor 2.x+).
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';
import { stripCommentsForRegex } from '../strip-comments';

export const ktorResolver: FrameworkResolver = {
  name: 'ktor',
  languages: ['kotlin'],

  detect(context: ResolutionContext): boolean {
    // build.gradle.kts
    const gradleKts = context.readFile('build.gradle.kts');
    if (gradleKts && (gradleKts.includes('ktor') || gradleKts.includes('io.ktor'))) return true;

    // build.gradle
    const gradle = context.readFile('build.gradle');
    if (gradle && (gradle.includes('ktor') || gradle.includes('io.ktor'))) return true;

    // pom.xml
    const pom = context.readFile('pom.xml');
    if (pom && pom.includes('io.ktor')) return true;

    // Kotlin source with Ktor markers
    for (const file of context.getAllFiles()) {
      if (!file.endsWith('.kt')) continue;
      const content = context.readFile(file);
      if (
        content &&
        (content.includes('import io.ktor') ||
          content.includes('fun Application.') ||
          content.includes('embeddedServer('))
      ) {
        return true;
      }
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Route handlers referenced by name (e.g. `get("/path", ::handlerFn)`)
    const candidates = context.getNodesByName(ref.referenceName);
    const fn = candidates.find((n) => n.kind === 'function' || n.kind === 'method');
    if (fn) {
      return { original: ref, targetNodeId: fn.id, confidence: 0.8, resolvedBy: 'framework' };
    }
    return null;
  },

  extract(filePath: string, content: string) {
    if (!filePath.endsWith('.kt')) return { nodes: [], references: [] };

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const lang = 'kotlin' as const;
    const safe = stripCommentsForRegex(content, 'java');

    // ── HTTP verb routes ────────────────────────────────────────────────────
    // Patterns:
    //   get("/path") { ... }
    //   post("/path") { body = call.receive<T>(); ... }
    //   get("/path", ::handlerFn)   ← function reference
    //   get("/path", handlerFn)     ← named handler
    const VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    const verbRe = new RegExp(
      `\\b(${VERBS.join('|')})\\s*\\(\\s*["'\`]([^"'\`]*)["|'\`]`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = verbRe.exec(safe)) !== null) {
      const method = m[1]!.toUpperCase();
      const routePath = m[2]!;
      const line = safe.slice(0, m.index).split('\n').length;
      const routeNode: Node = {
        id: `route:${filePath}:${line}:${method}:${routePath}`,
        kind: 'route',
        name: `${method} ${routePath}`,
        qualifiedName: `${filePath}::route:${routePath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: m[0].length,
        language: lang,
        updatedAt: now,
      };
      nodes.push(routeNode);

      // Optional named / function-reference handler
      const tail = safe.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const refMatch = tail.match(/,\s*(?:::\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/);
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

    // ── @Resource type-safe routing (Ktor 2.x) ─────────────────────────────
    // @Resource("/articles")
    // class Articles { @Resource("{id}") class Id(...) }
    const resourceRe = /@Resource\s*\(\s*["']([^"']*)["|']\s*\)\s*(?:data\s+)?class\s+\w+/g;
    while ((m = resourceRe.exec(safe)) !== null) {
      const routePath = m[1]!;
      const line = safe.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `route:${filePath}:${line}:RESOURCE:${routePath}`,
        kind: 'route',
        name: `RESOURCE ${routePath}`,
        qualifiedName: `${filePath}::resource:${routePath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: m[0].length,
        language: lang,
        updatedAt: now,
      });
    }

    // ── Application.module extension functions ──────────────────────────────
    // fun Application.module() { ... }
    // fun Application.configureRouting() { ... }
    const moduleRe = /fun\s+Application\s*\.\s*(\w+)\s*\(/g;
    while ((m = moduleRe.exec(safe)) !== null) {
      const name = m[1]!;
      const line = safe.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `ktor-module:${filePath}:${line}:${name}`,
        kind: 'function',
        name: `Application.${name}`,
        qualifiedName: `${filePath}::Application.${name}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: m[0].length,
        language: lang,
        updatedAt: now,
      });
    }

    // ── embeddedServer entry points ─────────────────────────────────────────
    // embeddedServer(Netty, port = 8080) { ... }
    const embeddedRe = /\bembeddedServer\s*\(\s*(\w+)/g;
    while ((m = embeddedRe.exec(safe)) !== null) {
      const engine = m[1]!;
      const line = safe.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `ktor-server:${filePath}:${line}:${engine}`,
        kind: 'function',
        name: `embeddedServer(${engine})`,
        qualifiedName: `${filePath}::embeddedServer`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: m[0].length,
        language: lang,
        updatedAt: now,
      });
    }

    return { nodes, references };
  },
};

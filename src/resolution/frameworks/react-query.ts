/**
 * React Query / TanStack Query Framework Resolver
 *
 * Handles TanStack Query (formerly React Query) patterns:
 * useQuery, useMutation, useInfiniteQuery, queryKeys, queryFn,
 * QueryClient, and server-side patterns (Next.js + React Query).
 *
 * Also covers SWR (similar data-fetching pattern from Vercel).
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const reactQueryResolver: FrameworkResolver = {
  name: 'react-query',
  // Include tsx/jsx since React Query is typically used in React component files
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (
          deps['@tanstack/react-query'] ||
          deps['@tanstack/query-core'] ||
          deps['react-query'] ||
          deps['swr']
        ) {
          return true;
        }
      } catch {
        // Invalid JSON
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Pattern 1: queryFn / fetcher functions (often ending in 'Fetcher', 'Query', 'Api')
    if (
      ref.referenceName.endsWith('Fetcher') ||
      ref.referenceName.endsWith('Query') ||
      ref.referenceName.endsWith('Api') ||
      ref.referenceName.endsWith('Service')
    ) {
      const candidates = context.getNodesByName(ref.referenceName);
      const fn = candidates.find((n) => n.kind === 'function' || n.kind === 'method');
      if (fn) return { original: ref, targetNodeId: fn.id, confidence: 0.75, resolvedBy: 'framework' };
    }

    // Pattern 2: Custom hooks wrapping useQuery (use* prefix)
    if (ref.referenceName.startsWith('use') && ref.referenceName.length > 3) {
      const candidates = context.getNodesByName(ref.referenceName);
      const hook = candidates.find((n) => n.kind === 'function');
      if (hook) return { original: ref, targetNodeId: hook.id, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Pattern 3: QueryKeys objects (commonly named queryKeys or keys)
    if (ref.referenceName === 'queryKeys' || ref.referenceName.endsWith('Keys')) {
      const candidates = context.getNodesByName(ref.referenceName);
      const obj = candidates.find((n) =>
        n.kind === 'variable' || n.kind === 'constant' || n.kind === 'function'
      );
      if (obj) return { original: ref, targetNodeId: obj.id, confidence: 0.8, resolvedBy: 'framework' };
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
    const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const lang = isTs ? (filePath.endsWith('.tsx') ? 'tsx' : 'typescript') : filePath.endsWith('.jsx') ? 'jsx' : 'javascript';

    // Extract queryKey factory functions / objects
    // e.g. export const userKeys = { all: ['users'], detail: (id: string) => [...] }
    const queryKeyRe = /(?:export\s+)?(?:const|let)\s+([\w]+Keys)\s*=/g;
    let m: RegExpExecArray | null;
    while ((m = queryKeyRe.exec(content)) !== null) {
      const name = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `query-key:${filePath}:${name}:${line}`,
        kind: 'constant',
        name,
        qualifiedName: `${filePath}::${name}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: m[0].length,
        language: lang,
        isExported: m[0].includes('export'),
        updatedAt: now,
      });
    }

    // Extract custom hooks wrapping useQuery / useMutation / useInfiniteQuery / useSuspenseQuery
    // e.g. export function useUserData(id: string) { return useQuery({ ... }) }
    const customHookRe =
      /(?:export\s+)?(?:function|const|let)\s+(use[A-Z][A-Za-z0-9_]*)\s*[=(][^{]*\{[\s\S]{0,300}?(?:useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|useSWR)\s*\(/g;
    while ((m = customHookRe.exec(content)) !== null) {
      const name = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `rq-hook:${filePath}:${name}:${line}`,
        kind: 'function',
        name,
        qualifiedName: `${filePath}::${name}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        isExported: m[0].includes('export'),
        updatedAt: now,
      });

      // Link back to queryFn referenced in the same hook body
      const bodyStart = m.index + m[0].indexOf('{');
      const bodySnippet = content.slice(bodyStart, bodyStart + 400);
      const queryFnMatch = bodySnippet.match(/queryFn\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/);
      if (queryFnMatch) {
        references.push({
          fromNodeId: `rq-hook:${filePath}:${name}:${line}`,
          referenceName: queryFnMatch[1]!,
          referenceKind: 'calls',
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

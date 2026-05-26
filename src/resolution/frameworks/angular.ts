/**
 * Angular Framework Resolver
 *
 * Handles Angular component references, dependency injection,
 * routing (RouterModule, Routes), NgModule patterns, and
 * Angular standalone component API (v14+).
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const angularResolver: FrameworkResolver = {
  name: 'angular',
  // Angular primarily uses TypeScript (.ts) and templates (.html); tsx/jsx not typical
  languages: ['typescript'],

  detect(context: ResolutionContext): boolean {
    // Check for @angular/core in package.json
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@angular/core'] || deps['@angular/cli']) {
          return true;
        }
      } catch {
        // Invalid JSON
      }
    }

    // Check for angular.json config file
    if (context.fileExists('angular.json') || context.fileExists('.angular.json')) {
      return true;
    }

    // Check for Angular-specific imports in TS files
    const allFiles = context.getAllFiles();
    for (const file of allFiles.slice(0, 30)) {
      if (!file.endsWith('.ts')) continue;
      const content = context.readFile(file);
      if (content && (
        content.includes('@angular/core') ||
        content.includes('@Component(') ||
        content.includes('@NgModule(') ||
        content.includes('@Injectable(')
      )) {
        return true;
      }
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Pattern 1: Component references (end with Component, PascalCase)
    if (
      (ref.referenceName.endsWith('Component') || ref.referenceName.endsWith('Page')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, COMPONENT_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
      }
    }

    // Pattern 2: Service injection (end with Service)
    if (ref.referenceName.endsWith('Service') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, SERVICE_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
      }
    }

    // Pattern 3: Guard references (end with Guard)
    if (ref.referenceName.endsWith('Guard') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, GUARD_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    // Pattern 4: Pipe references (end with Pipe)
    if (ref.referenceName.endsWith('Pipe') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, PIPE_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    // Pattern 5: Module references (end with Module)
    if (ref.referenceName.endsWith('Module') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, MODULE_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    // Pattern 6: Directive references (end with Directive)
    if (ref.referenceName.endsWith('Directive') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, [], context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    return null;
  },

  extract(filePath: string, content: string) {
    if (!filePath.endsWith('.ts')) return { nodes: [], references: [] };

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    // Extract Angular routes from RouterModule.forRoot / forChild
    // Routes = [{ path: 'x', component: X }, ...]
    const routeObjRe = /\{\s*path\s*:\s*['"`]([^'"`]*)['"`]\s*,[\s\S]*?(?:component\s*:\s*([A-Z][A-Za-z0-9_]*))?/g;
    if (
      content.includes('RouterModule') ||
      content.includes('provideRouter') ||
      content.includes('Routes')
    ) {
      let m: RegExpExecArray | null;
      while ((m = routeObjRe.exec(content)) !== null) {
        const routePath = m[1];
        const componentName = m[2];
        if (routePath === undefined) continue;

        const line = content.slice(0, m.index).split('\n').length;
        const routeNode: Node = {
          id: `route:${filePath}:${line}:${routePath}`,
          kind: 'route',
          name: routePath || '/',
          qualifiedName: `${filePath}::route:${routePath || '/'}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: 0,
          language: 'typescript',
          updatedAt: now,
        };
        nodes.push(routeNode);

        if (componentName) {
          references.push({
            fromNodeId: routeNode.id,
            referenceName: componentName,
            referenceKind: 'references',
            line,
            column: 0,
            filePath,
            language: 'typescript',
          });
        }
      }
    }

    // Extract @Component decorator metadata
    const componentDecoratorRe = /@Component\s*\(\s*\{[^}]*selector\s*:\s*['"`]([^'"`]+)['"`]/g;
    let dm: RegExpExecArray | null;
    while ((dm = componentDecoratorRe.exec(content)) !== null) {
      const selector = dm[1]!;
      const line = content.slice(0, dm.index).split('\n').length;
      // Find class name that follows
      const classMatch = content.slice(dm.index).match(/\bclass\s+([A-Z][A-Za-z0-9_]*)/);
      if (classMatch) {
        const className = classMatch[1]!;
        nodes.push({
          id: `component:${filePath}:${className}:${line}`,
          kind: 'component',
          name: className,
          qualifiedName: `${filePath}::${className}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: 0,
          language: 'typescript',
          docstring: `selector: ${selector}`,
          updatedAt: now,
        });
      }
    }

    return { nodes, references };
  },
};

// --- Helpers ---

const CLASS_KINDS = new Set(['class']);

const COMPONENT_DIRS = [
  '/components/', '/src/components/', '/app/components/',
  '/pages/', '/src/pages/', '/views/', '/src/views/',
  '/features/', '/src/features/',
];

const SERVICE_DIRS = [
  '/services/', '/src/services/', '/app/services/',
  '/core/', '/src/core/', '/shared/', '/src/shared/',
];

const GUARD_DIRS = [
  '/guards/', '/src/guards/', '/app/guards/',
  '/auth/', '/src/auth/',
];

const PIPE_DIRS = [
  '/pipes/', '/src/pipes/', '/app/pipes/', '/shared/pipes/',
];

const MODULE_DIRS = [
  '/modules/', '/src/modules/', '/app/modules/',
  '/features/', '/src/features/',
];

function resolveByNameAndKind(
  name: string,
  kinds: Set<string>,
  preferredDirPatterns: string[],
  context: ResolutionContext,
): string | null {
  const candidates = context.getNodesByName(name);
  if (candidates.length === 0) return null;

  const kindFiltered = candidates.filter((n) => kinds.has(n.kind));
  if (kindFiltered.length === 0) return null;

  if (preferredDirPatterns.length > 0) {
    const preferred = kindFiltered.filter((n) =>
      preferredDirPatterns.some((d) => n.filePath.includes(d))
    );
    if (preferred.length > 0) return preferred[0]!.id;
  }

  return kindFiltered[0]!.id;
}

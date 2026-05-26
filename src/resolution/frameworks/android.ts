/**
 * Android Framework Resolver
 *
 * Handles Android / Kotlin patterns:
 * - Jetpack Compose (@Composable, CompositionLocal, NavHost)
 * - Activity / Fragment navigation (startActivity, findNavController)
 * - ViewModel / LiveData / StateFlow (MVVM)
 * - Room ORM (@Dao, @Entity, @Database)
 * - Hilt / Dagger dependency injection (@HiltViewModel, @Inject)
 * - Retrofit / OkHttp API client patterns
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const androidResolver: FrameworkResolver = {
  name: 'android',
  languages: ['kotlin', 'java'],

  detect(context: ResolutionContext): boolean {
    // Android projects always have a manifest
    if (
      context.fileExists('AndroidManifest.xml') ||
      context.fileExists('app/src/main/AndroidManifest.xml')
    ) {
      return true;
    }

    // Check for build.gradle with Android plugin
    const buildGradle =
      context.readFile('build.gradle') ||
      context.readFile('build.gradle.kts') ||
      context.readFile('app/build.gradle') ||
      context.readFile('app/build.gradle.kts');

    if (
      buildGradle &&
      (buildGradle.includes('com.android.application') ||
        buildGradle.includes('com.android.library') ||
        buildGradle.includes('android {'))
    ) {
      return true;
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Pattern 1: ViewModel references (end with ViewModel)
    if (ref.referenceName.endsWith('ViewModel') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, VM_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 2: Repository pattern (end with Repository or Repo)
    if (
      (ref.referenceName.endsWith('Repository') || ref.referenceName.endsWith('Repo')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, REPO_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 3: DAO interfaces (end with Dao)
    if (ref.referenceName.endsWith('Dao') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, INTERFACE_OR_CLASS, DAO_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 4: Use cases (end with UseCase or Interactor)
    if (
      (ref.referenceName.endsWith('UseCase') || ref.referenceName.endsWith('Interactor')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, USECASE_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Pattern 5: Service classes (end with Service)
    if (ref.referenceName.endsWith('Service') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, SERVICE_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    return null;
  },

  extract(filePath: string, content: string) {
    if (!filePath.endsWith('.kt') && !filePath.endsWith('.java')) {
      return { nodes: [], references: [] };
    }

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const lang = filePath.endsWith('.kt') ? 'kotlin' : 'java';

    // Extract @Composable functions (Jetpack Compose)
    const composableRe = /@Composable\s*\n\s*(?:fun|public\s+fun)\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = composableRe.exec(content)) !== null) {
      const name = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `composable:${filePath}:${name}:${line}`,
        kind: 'component',
        name,
        qualifiedName: `${filePath}::${name}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      });
    }

    // Jetpack Compose Navigation: composable("route") { ... }
    // NavHost(navController, startDestination = "home") { composable("home") { HomeScreen() } }
    const navComposableRe = /\bcomposable\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = navComposableRe.exec(content)) !== null) {
      const routePath = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      const routeNode: Node = {
        id: `route:${filePath}:${line}:${routePath}`,
        kind: 'route',
        name: routePath,
        qualifiedName: `${filePath}::route:${routePath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      };
      nodes.push(routeNode);

      // Find composable function body reference (next PascalCase call)
      const tail = content.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const compCall = tail.match(/\{\s*([A-Z][A-Za-z0-9_]*)\s*\(/);
      if (compCall) {
        references.push({
          fromNodeId: routeNode.id,
          referenceName: compCall[1]!,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: lang,
        });
      }
    }

    // Retrofit API interfaces: @GET, @POST, etc.
    const retrofitRe = /@(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = retrofitRe.exec(content)) !== null) {
      const method = m[1]!;
      const routePath = m[2]!;
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
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
      });
    }

    return { nodes, references };
  },
};

const CLASS_KINDS = new Set(['class']);
const INTERFACE_OR_CLASS = new Set(['class', 'interface']);

const VM_DIRS = ['/viewmodel/', '/viewmodels/', '/presentation/', '/ui/'];
const REPO_DIRS = ['/repository/', '/repositories/', '/data/', '/domain/'];
const DAO_DIRS = ['/dao/', '/database/', '/db/', '/data/local/'];
const USECASE_DIRS = ['/usecase/', '/usecases/', '/domain/', '/interactor/'];
const SERVICE_DIRS = ['/service/', '/services/', '/data/remote/'];

function resolveByNameAndKind(
  name: string,
  kinds: Set<string>,
  preferredDirs: string[],
  context: ResolutionContext,
): string | null {
  const candidates = context.getNodesByName(name);
  if (candidates.length === 0) return null;
  const filtered = candidates.filter((n) => kinds.has(n.kind));
  if (filtered.length === 0) return null;
  if (preferredDirs.length > 0) {
    const preferred = filtered.filter((n) => preferredDirs.some((d) => n.filePath.includes(d)));
    if (preferred.length > 0) return preferred[0]!.id;
  }
  return filtered[0]!.id;
}

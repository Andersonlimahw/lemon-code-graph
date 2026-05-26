/**
 * React Native Framework Resolver
 *
 * Handles React Native patterns: screen navigation (React Navigation,
 * Expo Router), StyleSheet, NativeModules, and Expo-specific APIs.
 *
 * Also handles Expo Router (file-based routing for RN).
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const reactNativeResolver: FrameworkResolver = {
  name: 'react-native',
  // Include tsx/jsx since React Native uses JSX in both TypeScript and JS files
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (
          deps['react-native'] ||
          deps['expo'] ||
          deps['@react-navigation/native'] ||
          deps['@react-navigation/stack'] ||
          deps['expo-router']
        ) {
          return true;
        }
      } catch {
        // Invalid JSON
      }
    }

    // Check for app.json (Expo) or metro.config.js (RN)
    if (context.fileExists('app.json') || context.fileExists('metro.config.js') || context.fileExists('metro.config.ts')) {
      const appJson = context.readFile('app.json');
      if (appJson && (appJson.includes('"expo"') || appJson.includes('"react-native"'))) {
        return true;
      }
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Pattern 1: Screen components (often ending in Screen)
    if (ref.referenceName.endsWith('Screen') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, COMPONENT_KINDS, SCREEN_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 2: Navigation-referenced components
    if (/^[A-Z][A-Za-z0-9]*(?:Screen|View|Page|Stack|Tab)$/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, COMPONENT_KINDS, SCREEN_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Pattern 3: Custom hooks (use*)
    if (ref.referenceName.startsWith('use') && ref.referenceName.length > 3) {
      const candidates = context.getNodesByName(ref.referenceName);
      const hook = candidates.find((n) => n.kind === 'function');
      if (hook) return { original: ref, targetNodeId: hook.id, confidence: 0.8, resolvedBy: 'framework' };
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
    const lang = filePath.endsWith('.tsx') ? 'tsx' : filePath.endsWith('.jsx') ? 'jsx' : filePath.endsWith('.ts') ? 'typescript' : 'javascript';

    // React Navigation stack: createStackNavigator / createBottomTabNavigator
    // <Stack.Screen name="Home" component={HomeScreen} />
    const navScreenRe = /<(?:Stack|Tab|Drawer|Native)\.Screen\b[^>]*\bname\s*=\s*['"`]([^'"`]+)['"`][^>]*\bcomponent\s*=\s*\{\s*([A-Z][A-Za-z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = navScreenRe.exec(content)) !== null) {
      const screenName = m[1]!;
      const componentName = m[2]!;
      const line = content.slice(0, m.index).split('\n').length;

      const routeNode: Node = {
        id: `route:${filePath}:${line}:${screenName}`,
        kind: 'route',
        name: screenName,
        qualifiedName: `${filePath}::route:${screenName}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      };
      nodes.push(routeNode);
      references.push({
        fromNodeId: routeNode.id,
        referenceName: componentName,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: lang,
      });
    }

    // Expo Router: file-based routing (_layout.tsx, index.tsx, [param].tsx)
    if (
      filePath.includes('/app/') &&
      (filePath.endsWith('_layout.tsx') || filePath.endsWith('_layout.ts') ||
       filePath.endsWith('index.tsx') || filePath.endsWith('index.ts') ||
       /\[[^\]]+\]/.test(filePath))
    ) {
      const routePath = expoFileToRoute(filePath);
      if (routePath && content.includes('export default')) {
        const line = content.indexOf('export default');
        const lineNum = content.slice(0, line).split('\n').length;
        nodes.push({
          id: `route:${filePath}:${routePath}:${lineNum}`,
          kind: 'route',
          name: routePath,
          qualifiedName: `${filePath}::route:${routePath}`,
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          startColumn: 0,
          endColumn: 0,
          language: lang,
          updatedAt: now,
        });
      }
    }

    return { nodes, references };
  },
};

function expoFileToRoute(filePath: string): string | null {
  if (!/(?:^|\/)app\//.test(filePath)) return null;

  let route = filePath
    .replace(/^.*app\//, '/')
    .replace(/\/_layout\.(tsx?|jsx?)$/, '')
    .replace(/\/index\.(tsx?|jsx?)$/, '')
    .replace(/\.(tsx?|jsx?)$/, '')
    .replace(/\[([^\]]+)\]/g, ':$1');

  return route || '/';
}

const COMPONENT_KINDS = new Set(['component', 'function', 'class']);
const SCREEN_DIRS = [
  '/screens/', '/src/screens/',
  '/pages/', '/src/pages/',
  '/views/', '/src/views/',
  '/navigation/', '/src/navigation/',
];

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

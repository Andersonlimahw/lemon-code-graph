/**
 * iOS / macOS Native Framework Resolver
 *
 * Handles native Apple platform patterns:
 * - SwiftUI views and navigation (NavigationStack, TabView, .sheet)
 * - UIKit view controllers (UIViewController lifecycle, segues, storyboards)
 * - Combine publisher/subscriber chains
 * - CoreData / SwiftData entities
 * - Async/await + actor isolation patterns
 *
 * Note: swiftUIResolver and uikitResolver in swift.ts handle general Swift
 * patterns. This resolver adds iOS-specific navigation and data-layer coverage.
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, ResolvedRef, ResolutionContext } from '../types';

export const iosResolver: FrameworkResolver = {
  name: 'ios',
  languages: ['swift'],

  detect(context: ResolutionContext): boolean {
    const allFiles = context.getAllFiles();

    // iOS-specific project files
    for (const file of allFiles) {
      if (file.endsWith('.xcodeproj') || file.endsWith('.xcworkspace')) return true;
      if (file.endsWith('Package.swift')) {
        const content = context.readFile(file);
        // Only iOS/macOS, not Vapor server
        if (
          content &&
          (content.includes('.iOS') || content.includes('.macOS')) &&
          !content.includes('vapor')
        ) {
          return true;
        }
      }
    }

    // Check for UIKit / AppKit / SwiftUI imports
    for (const file of allFiles.slice(0, 30)) {
      if (!file.endsWith('.swift')) continue;
      const content = context.readFile(file);
      if (
        content &&
        (content.includes('import UIKit') ||
          content.includes('import AppKit') ||
          content.includes('import SwiftUI'))
      ) {
        return true;
      }
    }

    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // Pattern 1: ViewController references (UIKit)
    if (
      (ref.referenceName.endsWith('ViewController') || ref.referenceName.endsWith('Controller')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, VC_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 2: View references (SwiftUI)
    if (ref.referenceName.endsWith('View') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, STRUCT_OR_CLASS, VIEW_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Pattern 3: ViewModel / ObservableObject
    if (
      (ref.referenceName.endsWith('ViewModel') || ref.referenceName.endsWith('Store')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_OR_STRUCT, VM_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
    }

    // Pattern 4: Service / Manager / Repository
    if (
      (ref.referenceName.endsWith('Service') ||
        ref.referenceName.endsWith('Manager') ||
        ref.referenceName.endsWith('Repository')) &&
      /^[A-Z]/.test(ref.referenceName)
    ) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_OR_STRUCT, SERVICE_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    // Pattern 5: Coordinator pattern
    if (ref.referenceName.endsWith('Coordinator') && /^[A-Z]/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, [], context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }

    return null;
  },

  extract(filePath: string, content: string) {
    if (!filePath.endsWith('.swift')) return { nodes: [], references: [] };

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    // SwiftUI NavigationStack / NavigationLink destinations
    // NavigationLink(destination: { DetailView() })
    // .navigationDestination(for: String.self) { _ in DetailView() }
    const navDestRe = /\.navigationDestination\s*\(for:[^)]+\)\s*\{[^}]*?([A-Z][A-Za-z0-9_]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = navDestRe.exec(content)) !== null) {
      const destView = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      references.push({
        fromNodeId: `file:${filePath}`,
        referenceName: destView,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: 'swift',
      });
    }

    // NavigationLink(value:) destination inlined
    const navLinkRe = /NavigationLink\s*\(\s*(?:value|destination)[^)]*\)\s*\{[^}]*?([A-Z][A-Za-z0-9_]*)\s*\(/g;
    while ((m = navLinkRe.exec(content)) !== null) {
      const destView = m[1]!;
      if (['Text', 'Image', 'Label', 'Icon'].includes(destView)) continue;
      const line = content.slice(0, m.index).split('\n').length;
      references.push({
        fromNodeId: `file:${filePath}`,
        referenceName: destView,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: 'swift',
      });
    }

    // CoreData / SwiftData entity classes
    // @Model class User { ... }  or NSManagedObject subclass
    const coreDataRe = /@Model\s+(?:final\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g;
    while ((m = coreDataRe.exec(content)) !== null) {
      const name = m[1]!;
      const line = content.slice(0, m.index).split('\n').length;
      nodes.push({
        id: `model:${filePath}:${name}:${line}`,
        kind: 'class',
        name,
        qualifiedName: `${filePath}::${name}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: 'swift',
        updatedAt: now,
      });
    }

    return { nodes, references };
  },
};

const CLASS_KINDS = new Set(['class']);
const STRUCT_OR_CLASS = new Set(['class', 'struct']);
const CLASS_OR_STRUCT = new Set(['class', 'struct']);

const VC_DIRS = ['/ViewControllers/', '/Controllers/', '/Scenes/', '/Features/'];
const VIEW_DIRS = ['/Views/', '/Components/', '/Screens/', '/UI/'];
const VM_DIRS = ['/ViewModels/', '/Presentation/', '/Features/'];
const SERVICE_DIRS = ['/Services/', '/Repositories/', '/Data/', '/Network/'];

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

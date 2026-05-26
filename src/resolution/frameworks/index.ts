/**
 * Framework Resolver Registry
 *
 * Full-stack, frontend, and mobile framework resolvers for the
 * modern development stack:
 *
 * JavaScript/TypeScript:
 *   Express · NestJS · React · Next.js · Angular · Vue/Nuxt · Svelte/SvelteKit
 *   React Query · React Native · Bun/Elysia
 *
 * Mobile / Native:
 *   Android (Kotlin/Java · Jetpack Compose · Room · Hilt)
 *   iOS / macOS (SwiftUI · UIKit · Combine · SwiftData)
 *
 * Other:
 *   Go · Java/Spring · C# ASP.NET · FastAPI (Python) · Cargo workspaces
 *
 * Removed (not part of target stack):
 *   Django, Flask, Laravel, Drupal (PHP), Axum/Actix/Rocket (Rust), Vapor (Swift)
 *   Rails (Ruby)
 */

import { FrameworkResolver, ResolutionContext } from '../types';
import type { Language } from '../../types';

// JavaScript / TypeScript web
import { expressResolver } from './express';
import { nestjsResolver } from './nestjs';
import { reactResolver } from './react';
import { svelteResolver } from './svelte';
import { vueResolver } from './vue';

// Frontend frameworks (new)
import { angularResolver } from './angular';
import { reactQueryResolver } from './react-query';

// Mobile (new)
import { reactNativeResolver } from './react-native';
import { androidResolver } from './android';
import { iosResolver } from './ios';

// Runtime (new)
import { bunResolver } from './bun';

// Python (FastAPI only — Django/Flask removed)
import { fastapiResolver } from './python';

// JVM
import { springResolver } from './java';
import { playResolver } from './play';

// Go
import { goResolver } from './go';

// C#
import { aspnetResolver } from './csharp';

// Swift — SwiftUI/UIKit only (Vapor removed)
import { swiftUIResolver, uikitResolver } from './swift';

/**
 * All registered framework resolvers.
 *
 * Ordered by detection priority — more specific frameworks before generic ones.
 */
const FRAMEWORK_RESOLVERS: FrameworkResolver[] = [
  // Mobile / Native (check first — narrower detection)
  androidResolver,
  iosResolver,
  reactNativeResolver,

  // JavaScript/TypeScript — full-stack & frontend
  bunResolver,
  nestjsResolver,
  expressResolver,
  reactQueryResolver,
  reactResolver,
  angularResolver,
  svelteResolver,
  vueResolver,

  // Python (FastAPI only)
  fastapiResolver,

  // JVM
  springResolver,
  playResolver,

  // Go
  goResolver,

  // C#
  aspnetResolver,

  // Swift — SwiftUI & UIKit (Vapor removed)
  swiftUIResolver,
  uikitResolver,
];

/**
 * Get all framework resolvers
 */
export function getAllFrameworkResolvers(): FrameworkResolver[] {
  return FRAMEWORK_RESOLVERS;
}

/**
 * Get a resolver by name
 */
export function getFrameworkResolver(name: string): FrameworkResolver | undefined {
  return FRAMEWORK_RESOLVERS.find((r) => r.name === name);
}

/**
 * Detect which frameworks are used in a project
 */
export function detectFrameworks(context: ResolutionContext): FrameworkResolver[] {
  return FRAMEWORK_RESOLVERS.filter((resolver) => {
    try {
      return resolver.detect(context);
    } catch {
      return false;
    }
  });
}

/**
 * Filter a list of detected frameworks down to ones that apply to a given language.
 * Frameworks without an explicit `languages` list are treated as universal.
 */
export function getApplicableFrameworks(
  detected: FrameworkResolver[],
  language: Language
): FrameworkResolver[] {
  return detected.filter(
    (fw) => !fw.languages || fw.languages.includes(language)
  );
}

/**
 * Register a custom framework resolver
 */
export function registerFrameworkResolver(resolver: FrameworkResolver): void {
  // Remove existing resolver with same name
  const index = FRAMEWORK_RESOLVERS.findIndex((r) => r.name === resolver.name);
  if (index !== -1) {
    FRAMEWORK_RESOLVERS.splice(index, 1);
  }
  FRAMEWORK_RESOLVERS.push(resolver);
}

// Re-export active framework resolvers
export { expressResolver } from './express';
export { nestjsResolver } from './nestjs';
export { reactResolver } from './react';
export { svelteResolver } from './svelte';
export { vueResolver } from './vue';
export { angularResolver } from './angular';
export { reactQueryResolver } from './react-query';
export { reactNativeResolver } from './react-native';
export { androidResolver } from './android';
export { iosResolver } from './ios';
export { bunResolver } from './bun';
export { fastapiResolver } from './python';
export { springResolver } from './java';
export { playResolver } from './play';
export { goResolver } from './go';
export { aspnetResolver } from './csharp';
export { swiftUIResolver, uikitResolver } from './swift';

// Legacy exports for backwards compatibility (resolvers still exist in files
// but are no longer registered — kept so existing imports don't hard-error)
export { djangoResolver, flaskResolver } from './python';
export { railsResolver } from './ruby';
export { rustResolver } from './rust';
export { laravelResolver, FACADE_MAPPINGS } from './laravel';
export { drupalResolver } from './drupal';
export { vaporResolver } from './swift';

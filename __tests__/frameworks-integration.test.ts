import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodeGraph } from '../src';
import { initGrammars, loadAllGrammars } from '../src/extraction/grammars';

beforeAll(async () => {
  await initGrammars();
  await loadAllGrammars();
});

describe('Angular end-to-end framework extraction', () => {
  let tmpDir: string | undefined;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('creates route nodes from Angular RouterModule configuration', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-angular-'));
    fs.writeFileSync(
      path.join(tmpDir, 'angular.json'),
      JSON.stringify({ version: 1, projects: { app: {} } }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@angular/core': '^17.0.0', '@angular/router': '^17.0.0' } })
    );
    fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'app', 'home.component.ts'),
      'import { Component } from "@angular/core";\n' +
        '@Component({ selector: "app-home", template: "<h1>Home</h1>" })\n' +
        'export class HomeComponent {}\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'app', 'app-routing.module.ts'),
      'import { NgModule } from "@angular/core";\n' +
        'import { RouterModule, Routes } from "@angular/router";\n' +
        'import { HomeComponent } from "./home.component";\n' +
        'const routes: Routes = [\n' +
        '  { path: "", component: HomeComponent },\n' +
        '  { path: "dashboard", component: HomeComponent },\n' +
        '];\n' +
        '@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })\n' +
        'export class AppRoutingModule {}\n'
    );

    const cg = CodeGraph.initSync(tmpDir);
    await cg.indexAll();

    // Route nodes are extracted from the Routes array
    const routes = cg.getNodesByKind('route');
    expect(routes.length).toBeGreaterThan(0);
    const dashboardRoute = routes.find((n) => n.name === 'dashboard');
    expect(dashboardRoute).toBeDefined();

    // Component node is indexed
    const components = cg.getNodesByKind('component');
    const homeComp = components.find((n) => n.name === 'HomeComponent');
    expect(homeComp).toBeDefined();

    cg.close();
  });
});

describe('React Native end-to-end framework extraction', () => {
  let tmpDir: string | undefined;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('creates route nodes from React Navigation screen configuration', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-rn-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          'react-native': '0.74.0',
          '@react-navigation/native': '^6.0.0',
          '@react-navigation/stack': '^6.0.0',
        },
      })
    );
    fs.mkdirSync(path.join(tmpDir, 'src', 'screens'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'screens', 'HomeScreen.tsx'),
      'import React from "react";\n' +
        'import { View, Text } from "react-native";\n' +
        'export default function HomeScreen() {\n' +
        '  return <View><Text>Home</Text></View>;\n' +
        '}\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'App.tsx'),
      'import React from "react";\n' +
        'import { NavigationContainer } from "@react-navigation/native";\n' +
        'import { createStackNavigator } from "@react-navigation/stack";\n' +
        'import HomeScreen from "./screens/HomeScreen";\n' +
        'const Stack = createStackNavigator();\n' +
        'export default function App() {\n' +
        '  return (\n' +
        '    <NavigationContainer>\n' +
        '      <Stack.Navigator>\n' +
        '        <Stack.Screen name="Home" component={HomeScreen} />\n' +
        '        <Stack.Screen name="Profile" component={HomeScreen} />\n' +
        '      </Stack.Navigator>\n' +
        '    </NavigationContainer>\n' +
        '  );\n' +
        '}\n'
    );

    const cg = CodeGraph.initSync(tmpDir);
    await cg.indexAll();

    // Navigation screen route nodes extracted
    const routes = cg.getNodesByKind('route');
    expect(routes.length).toBeGreaterThan(0);
    const homeRoute = routes.find((n) => n.name === 'Home');
    expect(homeRoute).toBeDefined();
    const profileRoute = routes.find((n) => n.name === 'Profile');
    expect(profileRoute).toBeDefined();

    // HomeScreen component referenced from route
    const edges = cg.getOutgoingEdges(homeRoute!.id);
    expect(edges.some((e) => e.kind === 'references')).toBe(true);

    cg.close();
  });
});

describe('Flutter end-to-end — setState→build synthesis', () => {
  let tmpDir: string | undefined;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('synthesizes a handler→build edge when a State method calls setState', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-flutter-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.dart'),
      'import "package:flutter/material.dart";\n' +
        'class CounterPage extends StatefulWidget {\n' +
        '  @override\n' +
        '  State<CounterPage> createState() => _CounterPageState();\n' +
        '}\n' +
        'class _CounterPageState extends State<CounterPage> {\n' +
        '  int _count = 0;\n' +
        '  void _increment() {\n' +
        '    setState(() {\n' +
        '      _count++;\n' +
        '    });\n' +
        '  }\n' +
        '  @override\n' +
        '  Widget build(BuildContext context) {\n' +
        '    return Text("$_count");\n' +
        '  }\n' +
        '}\n'
    );

    const cg = CodeGraph.initSync(tmpDir);
    await cg.indexAll();

    const methods = cg.getNodesByKind('method');
    const increment = methods.find((n) => n.name === '_increment');
    const build = methods.find((n) => n.name === 'build');
    expect(increment).toBeDefined();
    expect(build).toBeDefined();

    // setState re-runs build (Flutter-internal, no static edge). The synthesizer
    // bridges the handler → build so the "tap → setState → rebuilt UI" flow connects.
    const edges = cg.getOutgoingEdges(increment!.id);
    const toBuild = edges.find((e) => e.target === build!.id && e.kind === 'calls');
    expect(toBuild, '_increment should reach build via setState synthesis').toBeDefined();

    cg.close();
  });
});

describe('C++ end-to-end — virtual override synthesis', () => {
  let tmpDir: string | undefined;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('bridges a base virtual method to the subclass override', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-cpp-'));
    fs.writeFileSync(
      path.join(tmpDir, 'iter.cpp'),
      'class Iterator {\n' +
        ' public:\n' +
        '  virtual void Next() { }\n' +
        '};\n' +
        'class DBIter : public Iterator {\n' +
        ' public:\n' +
        '  void Next() override { advance(); }\n' +
        '  void advance() { }\n' +
        '};\n'
    );

    const cg = CodeGraph.initSync(tmpDir);
    await cg.indexAll();

    // Two methods named Next: the base virtual (lower line) and the override.
    const nexts = cg
      .getNodesByKind('method')
      .filter((n) => n.name === 'Next')
      .sort((a, b) => a.startLine - b.startLine);
    expect(nexts.length).toBe(2);
    const [baseNext, overrideNext] = nexts;

    // A vtable call to Iterator::Next dispatches to DBIter::Next — bridge it so
    // trace/callees from the interface method reaches the implementation.
    const edge = cg
      .getOutgoingEdges(baseNext!.id)
      .find((e) => e.target === overrideNext!.id && e.kind === 'calls');
    expect(edge, 'Iterator::Next should reach DBIter::Next via override synthesis').toBeDefined();

    cg.close();
  });
});

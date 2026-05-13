import basicsLessonSource from '../../docs-content/lessons/01-basics.md?raw';
import collectionsLessonSource from '../../docs-content/lessons/02-types-and-collections.md?raw';
import counterSource from '../../examples/counter/main.lm?raw';
import domRenderSource from '../../examples/dom-render/benchmark-compiled.lm?raw';
import formsSource from '../../examples/forms-store-resource/main.lm?raw';
import tabsSource from '../../examples/tabs/main.lm?raw';
import uiShowcaseSource from '../../examples/ui-showcase/main.lm?raw';
import gadtSource from '../../examples/gadts/ast-eval.lm?raw';
import hktSource from '../../examples/hkt-stdlib/main.lm?raw';
import constGenericsSource from '../../examples/const-generics/vec3.lm?raw';
import traitsSource from '../../examples/traits-demo/main.lm?raw';
import wasmSource from '../../examples/wasm-hello/math.lm?raw';
import webComponentsSource from '../../examples/web-components/main.lm?raw';
import channelsSource from '../../examples/channels-mpsc/main.lm?raw';
import threadPatternsSource from '../../examples/thread-patterns/worker-pool.lm?raw';
import asyncValidatorSource from '../../examples/async-json-validator/main.lm?raw';
import jsonParserSource from '../../examples/json-parser/main.lm?raw';
import githubSource from '../../examples/github-demo/main.lm?raw';
import httpSource from '../../examples/http-demo/main.lm?raw';
import type { CompileTarget, OutputTab } from './state';

export type Example = {
  id: string;
  label: string;
  detail: string;
  source: string;
  target: CompileTarget;
  tab: OutputTab;
};

export type ExampleGroup = {
  id: string;
  label: string;
  examples: Example[];
};

const example = (
  id: string,
  label: string,
  detail: string,
  source: string,
  target: CompileTarget = 'js',
  tab: OutputTab = 'js'
): Example => ({ id, label, detail, source, target, tab });

const extractLuminaBlock = (markdown: string, heading: string): string => {
  const sectionStart = markdown.indexOf(heading);
  const scopedMarkdown = sectionStart >= 0 ? markdown.slice(sectionStart) : markdown;
  const match = scopedMarkdown.match(/```lumina\r?\n([\s\S]*?)```/);
  if (!match) {
    throw new Error(`Missing Lumina example block for ${heading}`);
  }
  return `${match[1].trim()}\n`;
};

const basicsSource = extractLuminaBlock(basicsLessonSource, '## Example');
const safeIndexSource = extractLuminaBlock(collectionsLessonSource, '## Arrays and Vec');
const exampleAliases: Record<string, string> = {
  'view-basic': 'counter',
  results: 'safe-index',
};

export const exampleGroups: ExampleGroup[] = [
  {
    id: 'LANGUAGE_CORE',
    label: 'Language Core',
    examples: [
      example('basics', 'Functions', 'Functions and return values', basicsSource),
      example('safe-index', 'Option and Result', 'Safe access with Option-returning lookups', safeIndexSource),
    ],
  },
  {
    id: 'TYPE_SYSTEM',
    label: 'Type System',
    examples: [
      example('gadts', 'GADTs', 'Typed AST evaluation', gadtSource),
      example('hkt-stdlib', 'HKTs', 'Higher-kinded stdlib patterns', hktSource),
      example('const-generics', 'Const Generics', 'Fixed-size vector example', constGenericsSource),
      example('traits-demo', 'Traits', 'Trait implementation example', traitsSource),
    ],
  },
  {
    id: 'REACTIVE_UI',
    label: 'Reactive UI',
    examples: [
      example('counter', 'Counter', 'Signal-backed counter', counterSource, 'js', 'ui'),
      example('dom-render', 'DOM Manipulation', 'Compiled DOM render benchmark', domRenderSource, 'js', 'ui'),
      example('tabs', 'Tabs', 'Tabbed UI example', tabsSource, 'js', 'ui'),
      example('forms-store-resource', 'Form with Validation', 'Forms, store, and resource usage', formsSource, 'js', 'ui'),
      example('ui-showcase', 'Full App', 'Complete UI showcase', uiShowcaseSource, 'js', 'ui'),
    ],
  },
  {
    id: 'WEB_NATIVE',
    label: 'Web Native',
    examples: [
      example('wasm-hello', 'WASM', 'Math functions for web native output', wasmSource, 'wasm', 'wasm'),
      example('web-components', 'Web Components', 'Custom element example', webComponentsSource, 'js', 'ui'),
    ],
  },
  {
    id: 'ADVANCED',
    label: 'Advanced',
    examples: [
      example('channels-mpsc', 'Concurrency', 'MPSC channel pattern', channelsSource),
      example('thread-patterns', 'Thread Patterns', 'Worker pool pattern', threadPatternsSource),
      example('async-json-validator', 'Async', 'Async JSON validator', asyncValidatorSource),
      example('json-parser', 'Parser', 'JSON parser entrypoint', jsonParserSource),
      example('github-demo', 'HTTP + API', 'GitHub API client example', githubSource),
      example('http-demo', 'HTTP + API', 'HTTP package demo', httpSource),
    ],
  },
];

export const allExamples = exampleGroups.flatMap((group) => group.examples);

export const findExample = (id: string | null | undefined): Example | null =>
  id ? allExamples.find((item) => item.id === (exampleAliases[id] ?? id)) ?? null : null;

export const defaultExample = findExample('basics') ?? allExamples[0];

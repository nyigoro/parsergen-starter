import basicsLessonSource from '../../docs-content/lessons/01-basics.md?raw';
import counterSource from '../../examples/counter/main.lm?raw';
import hktSource from '../../examples/hkt-stdlib/main.lm?raw';
import wasmSource from '../../examples/wasm-hello/math.lm?raw';
import channelsSource from '../../examples/channels-mpsc/main.lm?raw';
import threadChannelSource from '../../examples/thread-channel-producer-consumer/main.lm?raw';
import parallelFibSource from '../../examples/thread-patterns/parallel-fibonacci.lm?raw';
import threadPatternsSource from '../../examples/thread-patterns/worker-pool.lm?raw';
import type { CompileTarget, OutputTab } from './state';

export type Example = {
  id: string;
  label: string;
  detail: string;
  source: string;
  target: CompileTarget;
  tab: OutputTab;
  groupId: string;
  featured?: boolean;
};

export type ExampleGroup = {
  id: string;
  label: string;
  description: string;
  examples: Example[];
};

const example = (
  groupId: string,
  id: string,
  label: string,
  detail: string,
  source: string,
  target: CompileTarget = 'js',
  tab: OutputTab = 'js',
  featured = false
): Example => ({ id, label, detail, source, target, tab, groupId, featured });

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
const safeIndexSource = `import { io, Option, str } from "@std";

fn main() -> i32 {
  let nums = [1, 2, 3];
  let picked = Option.unwrap_or(0, nums.get(8));
  io.println(str.concat("picked=", str.from_int(picked)));
  picked
}
`;
const controlFlowSource = `import { io, str } from "@std";

fn main() -> i32 {
  let mut total = 0;
  let mut i = 0;
  while (i < 5) {
    total = total + i;
    i = i + 1;
  }

  if (total > 5) {
    io.println(str.concat("total=", str.from_int(total)));
    total
  } else {
    io.println("small total");
    0
  }
}
`;
const patternMatchSource = `enum Step {
  Ready(i32),
  Done
}

fn score(step: Step) -> i32 {
  match step {
    Step.Ready(n) => n + 1,
    Step.Done => 0
  }
}

fn main() -> i32 {
  score(Step.Ready(4))
}
`;
const stringInterpolationSource = `import { io } from "@std";

fn main() -> string {
  let name = "Lumina";
  let message = "hello {name}";
  io.println(message);
  message
}
`;
const namedDefaultsSource = `import { io, str } from "@std";

fn price(base: i32, tax: i32 = 2, discount: i32 = 0) -> i32 {
  base + tax - discount
}

fn main() -> i32 {
  let subtotal = price(40, discount: 5);
  io.println(str.concat("subtotal=", str.from_int(subtotal)));
  subtotal
}
`;
const listComprehensionSource = `import { io, str } from "@std";

fn main() -> i32 {
  let xs = [1, 2, 3, 4, 5];
  let doubled = [x * 2 for x in xs if x > 2];
  let total = doubled.len();
  io.println(str.concat("total=", str.from_int(total)));
  total
}
`;
const typeHolesSource = `fn double(value: _) -> int {
  value * 2
}

fn main() -> int {
  double(21)
}
`;
const algebraicDataSource = `enum MaybeInt {
  Some(i32),
  None
}

fn unwrap_or(value: MaybeInt, fallback: i32) -> i32 {
  match value {
    MaybeInt.Some(n) => n,
    MaybeInt.None => fallback
  }
}

fn main() -> i32 {
  unwrap_or(MaybeInt.Some(7), 0)
}
`;
const reactiveGreetingSource = `import { createSignal, get } from "@std/reactive";
import {
  vnode,
  text,
  createDomRenderer,
  mount_reactive,
  props_empty,
  dom_get_element_by_id
} from "@std/render";

fn greetingView(name: Signal<string>) -> VNode {
  vnode("main", props_empty(), [
    vnode("h1", props_empty(), [text("Hello {get(name)}")]),
    vnode("p", props_empty(), [text("Reactive text comes from a Signal<string>.")])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let name = createSignal("Lumina");
  let _mounted = mount_reactive(renderer, container, || greetingView(name));
}

main();
`;
const domListSource = `import {
  vnode,
  text,
  createDomRenderer,
  mount_reactive,
  props_empty,
  dom_get_element_by_id
} from "@std/render";

fn listView() -> VNode {
  vnode("ul", props_empty(), [
    vnode("li", props_empty(), [text("Signals")]),
    vnode("li", props_empty(), [text("Types")]),
    vnode("li", props_empty(), [text("WASM")])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let _mounted = mount_reactive(renderer, container, || listView());
}

main();
`;

const exampleAliases: Record<string, string> = {
  'view-basic': 'counter',
  results: 'safe-index',
};

export const exampleGroups: ExampleGroup[] = [
  {
    id: 'LANGUAGE_CORE',
    label: 'Language Core',
    description: 'Functions, control flow, collections, and ergonomic everyday syntax.',
    examples: [
      example('LANGUAGE_CORE', 'basics', 'Functions', 'Functions and return values', basicsSource, 'js', 'run', true),
      example('LANGUAGE_CORE', 'control-flow', 'Control Flow', 'Loops, branches, and string interpolation', controlFlowSource, 'js', 'run'),
      example('LANGUAGE_CORE', 'safe-index', 'Option and Result', 'Safe access with Option-returning lookups', safeIndexSource, 'js', 'run', true),
      example('LANGUAGE_CORE', 'pattern-match', 'Pattern Matching', 'Match enum variants into typed values', patternMatchSource, 'js', 'types'),
      example('LANGUAGE_CORE', 'string-interpolation', 'Strings', 'Interpolate values directly into strings', stringInterpolationSource, 'js', 'run'),
      example('LANGUAGE_CORE', 'named-defaults', 'Named Defaults', 'Named arguments and default parameter values', namedDefaultsSource, 'js', 'types'),
      example('LANGUAGE_CORE', 'list-comprehension', 'List Comprehension', 'Filter and transform Vec values in one expression', listComprehensionSource, 'js', 'types'),
    ],
  },
  {
    id: 'TYPE_SYSTEM',
    label: 'Type System',
    description: 'HM inference, algebraic data types, HKTs, and type holes.',
    examples: [
      example('TYPE_SYSTEM', 'algebraic-data', 'Algebraic Data', 'Model variants and destructure them with match', algebraicDataSource, 'js', 'types'),
      example('TYPE_SYSTEM', 'hkt-stdlib', 'HKTs', 'Higher-kinded stdlib patterns', hktSource, 'js', 'types', true),
      example('TYPE_SYSTEM', 'type-holes', 'Type Holes', 'Let HM inference fill omitted types', typeHolesSource, 'js', 'types'),
    ],
  },
  {
    id: 'REACTIVE_UI',
    label: 'Reactive UI',
    description: 'Signals, reactive rendering, and DOM preview composition.',
    examples: [
      example('REACTIVE_UI', 'counter', 'Counter', 'Signal-backed counter', counterSource, 'js', 'ui', true),
      example('REACTIVE_UI', 'reactive-greeting', 'Reactive Greeting', 'Signal-driven text rendered into the preview', reactiveGreetingSource, 'js', 'ui'),
    ],
  },
  {
    id: 'WEB_NATIVE',
    label: 'Web Native',
    description: 'WASM and browser-native DOM output.',
    examples: [
      example('WEB_NATIVE', 'wasm-hello', 'WASM', 'Math functions for web native output', wasmSource, 'wasm', 'wasm', true),
      example('WEB_NATIVE', 'dom-list', 'DOM Mount', 'Mount browser-native DOM output from Lumina', domListSource, 'js', 'ui'),
    ],
  },
  {
    id: 'ADVANCED',
    label: 'Advanced',
    description: 'Concurrency, async flows, channels, and worker-oriented patterns.',
    examples: [
      example('ADVANCED', 'channels-mpsc', 'Concurrency', 'MPSC channel pattern', channelsSource, 'js', 'run', true),
      example('ADVANCED', 'thread-channel-producer-consumer', 'Producer Consumer', 'Bounded channel producer/consumer flow', threadChannelSource, 'js', 'run'),
      example('ADVANCED', 'thread-patterns', 'Thread Patterns', 'Worker pool pattern', threadPatternsSource, 'js', 'run'),
      example('ADVANCED', 'parallel-fibonacci', 'Parallel Fibonacci', 'Spawn workers and join typed results', parallelFibSource, 'js', 'run'),
    ],
  },
];

export const allExamples = exampleGroups.flatMap((group) => group.examples);

export const findExample = (id: string | null | undefined): Example | null =>
  id ? allExamples.find((item) => item.id === (exampleAliases[id] ?? id)) ?? null : null;

export const normalizeExampleSource = (source: string): string =>
  source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();

export const findExampleBySource = (
  source: string,
  preferredId?: string | null
): Example | null => {
  const normalized = normalizeExampleSource(source);
  const preferred = findExample(preferredId);
  if (preferred && normalizeExampleSource(preferred.source) === normalized) return preferred;
  return allExamples.find((example) => normalizeExampleSource(example.source) === normalized) ?? null;
};

export const defaultExample = findExample('basics') ?? allExamples[0];

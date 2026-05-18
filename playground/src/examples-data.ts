import basicsLessonSource from '../../docs-content/lessons/01-basics.md?raw';
import formsStoreResourceSource from '../../examples/forms-store-resource/main.lm?raw';
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
const counterPreviewSource = `import { render } from "@std";
import { createSignal } from "@std/reactive";
import { createDomRenderer, dom_get_element_by_id, mount_reactive } from "@std/render";

fn counterView(count: Signal<i32>) -> VNode {
  render.element("main", render.props_class("play-surface play-surface-teal"), [
    render.element("section", render.props_class("play-shell compact"), [
      render.element("p", render.props_class("play-eyebrow"), [render.text("Signal counter")]),
      render.element("h1", render.props_class("play-title"), [render.text("Reactive count")]),
      render.element("p", render.props_class("play-copy"), [
        render.text("The buttons update one Signal<i32>; the mounted view refreshes from the same source.")
      ]),
      render.element("div", render.props_class("counter-card"), [
        render.element("button", render.props_on_click(fn() -> void {
          let _ = render.set(count, render.get(count) - 1)
        }), [render.text("-")]),
        render.element("strong", render.props_class("counter-value"), [render.text(render.get(count))]),
        render.element("button", render.props_on_click(fn() -> void {
          let _ = render.set(count, render.get(count) + 1)
        }), [render.text("+")])
      ])
    ])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let count = createSignal(0);
  let _mounted = mount_reactive(renderer, container, || counterView(count));
}

main();
`;
const reactiveGreetingSource = `import { render } from "@std";
import { createSignal } from "@std/reactive";
import { createDomRenderer, dom_get_element_by_id, mount_reactive } from "@std/render";

fn greetingView(name: Signal<string>) -> VNode {
  render.element("main", render.props_class("play-surface play-surface-blue"), [
    render.element("section", render.props_class("play-shell compact"), [
      render.element("p", render.props_class("play-eyebrow blue"), [render.text("Reactive greeting")]),
      render.element("h1", render.props_class("play-title"), [render.text("Hello {render.get(name)}")]),
      render.element("p", render.props_class("play-copy"), [
        render.text("Swap the signal value and the preview updates without remounting the shell.")
      ]),
      render.element("div", render.props_class("play-row"), [
        render.element("button", render.props_on_click(fn() -> void {
          let _ = render.set(name, "Lumina")
        }), [render.text("Lumina")]),
        render.element("button", render.props_on_click(fn() -> void {
          let _ = render.set(name, "Ada")
        }), [render.text("Ada")]),
        render.element("button", render.props_on_click(fn() -> void {
          let _ = render.set(name, "Grace")
        }), [render.text("Grace")])
      ])
    ])
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
const formsStoreResourcePreviewSource = `${formsStoreResourceSource.includes('ProfileWorkspace') ? '' : '// adapted from forms-store-resource\n'}import { reactive, render } from "@std";
import { checkbox, submitProps, textInput } from "@std/forms";
import { createDomRenderer, dom_get_element_by_id, mount_reactive } from "@std/render";

async fn loadProfile() -> string {
  "Ada Lovelace"
}

fn ProfileWorkspace(
  label: string,
  name: Signal<string>,
  ready: Signal<bool>,
  queue: Signal<string>,
  mode: Signal<string>,
  draft: Signal<string>,
  profile: any
) -> VNode {
  render.element("section", render.props_class("profile-workspace"), [
    render.element("h1", render.props_class("profile-title"), [render.text(label)]),
    render.element("p", render.props_class("profile-status"), [render.text(render.resourceStatus(profile))]),
    render.suspense(render.text("Loading profile"), || [
      render.errorBoundary(render.text("Profile failed"), || [
        render.element("p", render.props_class("profile-name"), [render.text(render.resourceData(profile))])
      ])
    ]),
    render.element("div", render.props_class("profile-resource-actions"), [
      render.element("button", render.props_on_click(fn() -> void {
        let _ = render.resourceRefresh(profile)
      }), [render.text("Refresh profile")]),
      render.element("button", render.props_on_click(fn() -> void {
        let _ = render.resourceMutate(profile, "Grace Hopper")
      }), [render.text("Optimistic profile")]),
      render.element("button", render.props_on_click(fn() -> void {
        render.resourceInvalidate(profile)
      }), [render.text("Invalidate profile")])
    ]),
    render.element("form", submitProps(fn() -> void {
      let _ = reactive.set(draft, reactive.get(name))
    }, render.props_class("profile-form")), [
      render.element("input", textInput(name, render.props_class("profile-input")), []),
      render.element("label", render.props_class("profile-ready"), [
        render.element("input", checkbox(ready, render.props_class("profile-checkbox")), []),
        render.text("Ready to publish")
      ]),
      render.element("button", render.props_class("profile-submit"), [render.text("Save draft")])
    ]),
    render.element("p", render.props_class("profile-preview"), [
      render.text("Stored draft: "),
      render.text(reactive.get(draft))
    ]),
    render.element("div", render.props_class("profile-panels"), [
      render.element("button", render.props_merge(render.props_class("profile-panel-button"), render.props_on_click(fn() -> void {
        let _ = reactive.set(mode, "summary")
      })), [render.text("Summary")]),
      render.element("button", render.props_merge(render.props_class("profile-panel-button"), render.props_on_click(fn() -> void {
        let _ = reactive.set(mode, "editor")
      })), [render.text("Editor")]),
      show(reactive.get(mode) == "summary") {
        key("summary") => render.element("section", props { class: "profile-panel" }, [
          render.text("Summary stays keyed during hydration and panel swaps.")
        ])
      } else {
        key("editor") => render.element("section", props { class: "profile-panel" }, [
          render.text("Editor keeps its own keyed identity.")
        ])
      }
    ]),
    render.element("div", render.props_class("profile-queue-panel"), [
      render.element("button", render.props_on_click(fn() -> void {
        let _ = reactive.set(queue, "review -> publish -> draft")
      }), [render.text("Rotate queue")]),
      render.element("p", render.props_merge(render.props_class("profile-queue"), render.props_attr("aria-live", "polite")), [
        render.text("Queue: "),
        render.text(reactive.get(queue))
      ])
    ])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let name = reactive.createSignal("");
  let ready = reactive.createSignal(false);
  let queue = reactive.createSignal("draft -> review -> publish");
  let mode = reactive.createSignal("summary");
  let draft = reactive.createSignal("draft");
  let profile = render.createResource("example:profile", fn() -> Promise<any> { loadProfile() }, render.props_empty());
  let _mounted = mount_reactive(renderer, container, || ProfileWorkspace("Profile workspace", name, ready, queue, mode, draft, profile));
}

main();
`;
const tabsPreviewSource = `import { render } from "@std";
import { createSignal } from "@std/reactive";
import { createDomRenderer, dom_get_element_by_id, mount_reactive } from "@std/render";

fn panelCard(title: string, copy: string) -> VNode {
  render.element("article", render.props_class("play-card"), [
    render.element("h2", render.props_class("play-card-title"), [render.text(title)]),
    render.element("p", render.props_class("play-copy"), [render.text(copy)])
  ])
}

fn tabsView(active: Signal<string>) -> VNode {
  render.tabsRoot(active, || [
    render.element("main", render.props_class("play-surface play-surface-teal"), [
      render.element("section", render.props_class("play-shell"), [
        render.element("header", render.props_class("play-stack"), [
          render.element("p", render.props_class("play-eyebrow"), [render.text("Reactive tabs")]),
          render.element("h1", render.props_class("play-title"), [render.text("Lumina product workspace")]),
          render.element("p", render.props_class("play-copy"), [
            render.text("Switch tabs to see one Signal drive both the selected control and visible panel.")
          ])
        ]),
        render.tabsList(render.props_class("play-row"), || [
          render.tabsTrigger("overview", 0, [render.text("Overview")]),
          render.tabsTrigger("activity", 0, [render.text("Activity")]),
          render.tabsTrigger("settings", 0, [render.text("Settings")])
        ]),
        render.tabsPanel("overview", 0, [
          panelCard("Overview", "This single-source example models a tabbed workspace with Lumina Signals.")
        ]),
        render.tabsPanel("activity", 0, [
          panelCard("Activity", "Keyboard-friendly state changes keep the selected tab and rendered panel in sync.")
        ]),
        render.tabsPanel("settings", 0, [
          panelCard("Settings", "Styling stays local to the app while the playground preview owns the DOM runtime.")
        ]),
        render.element("p", render.props_class("play-muted"), [
          render.text("Active tab: "),
          render.text(render.get(active))
        ])
      ])
    ])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let active = createSignal("overview");
  let _mounted = mount_reactive(renderer, container, || tabsView(active));
}

main();
`;
const uiShowcasePreviewSource = `import { render } from "@std";
import { createDomRenderer, dom_get_element_by_id, mount_reactive } from "@std/render";

fn metric(label: string, value: string, accentClass: string) -> VNode {
  render.element("article", render.props_class("play-metric"), [
    render.element("p", render.props_class("play-metric-label"), [render.text(label)]),
    render.element("strong", render.props_class(accentClass), [render.text(value)])
  ])
}

fn insight() -> VNode {
  render.element("details", render.props_class("play-insight"), [
    render.element("summary", render.props_class("play-insight-title"), [render.text("Toggle insight")]),
    render.element("p", render.props_class("play-copy"), [
      render.text("This catalog version keeps the UI Showcase single-source and self-contained for the sandboxed preview.")
    ])
  ])
}

fn app() -> VNode {
  render.element("main", render.props_class("play-surface play-surface-blue"), [
    render.element("section", render.props_class("play-shell"), [
      render.element("header", render.props_class("play-stack"), [
        render.element("p", render.props_class("play-eyebrow blue"), [render.text("Lumina UI")]),
        render.element("h1", render.props_class("play-title"), [render.text("Styled headless workspace")]),
        render.element("p", render.props_class("play-copy"), [
          render.text("A compact preview of cards, actions, reactive state, and educational layout primitives.")
        ])
      ]),
      render.element("div", render.props_class("play-row"), [
        metric("Signals", "3", "play-number teal"),
        metric("Panels", "2", "play-number blue"),
        metric("Mode", "UI", "play-number violet")
      ]),
      insight()
    ])
  ])
}

pub fn main() -> void {
  let container = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let _mounted = mount_reactive(renderer, container, || app());
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
      example('REACTIVE_UI', 'counter', 'Counter', 'Signal-backed counter', counterPreviewSource, 'js', 'ui', true),
      example('REACTIVE_UI', 'reactive-greeting', 'Reactive Greeting', 'Signal-driven text rendered into the preview', reactiveGreetingSource, 'js', 'ui'),
      example('REACTIVE_UI', 'tabs', 'Tabs', 'Headless tabs rendered with reactive state and ARIA wiring', tabsPreviewSource, 'js', 'ui'),
      example('REACTIVE_UI', 'forms-store-resource', 'Forms + Resource', 'Forms, draft state, and async resource UI in the preview', formsStoreResourcePreviewSource, 'js', 'ui'),
      example('REACTIVE_UI', 'ui-showcase', 'UI Showcase', 'Styled headless UI composition rendered in the preview', uiShowcasePreviewSource, 'js', 'ui'),
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
      example('ADVANCED', 'channels-mpsc', 'Concurrency', 'MPSC channel pattern for host runtimes', channelsSource, 'js', 'js', true),
      example('ADVANCED', 'thread-channel-producer-consumer', 'Producer Consumer', 'Bounded channel producer/consumer flow for host runtimes', threadChannelSource, 'js', 'js'),
      example('ADVANCED', 'thread-patterns', 'Thread Patterns', 'Worker pool pattern for host runtimes', threadPatternsSource, 'js', 'js'),
      example('ADVANCED', 'parallel-fibonacci', 'Parallel Fibonacci', 'Spawn workers and join typed results in a host runtime', parallelFibSource, 'js', 'js'),
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

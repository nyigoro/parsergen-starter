export type PlaygroundPresetFile = {
  uri: string;
  source: string;
};

export type PlaygroundPreset = {
  id: string;
  label: string;
  detail: string;
  entryUri: string;
  files: PlaygroundPresetFile[];
  routeHref?: string;
};

const singleFilePreset = (
  id: string,
  label: string,
  detail: string,
  source: string,
  routeHref?: string
): PlaygroundPreset => ({
  id,
  label,
  detail,
  entryUri: 'main.lm',
  files: [{ uri: 'main.lm', source }],
  routeHref,
});

export const playgroundPresets: PlaygroundPreset[] = [
  singleFilePreset(
    'basics',
    'Basics',
    'Functions and return values',
    `import { io } from "@std";

fn square(x: int) -> int {
  return x * x
}

fn main() -> int {
  let answer = square(12);
  io.println("square={answer}");
  return answer
}`
  ),
  singleFilePreset(
    'safe-index',
    'Safe Indexing',
    'Option instead of undefined',
    `import { io, vec } from "@std";

fn main() -> int {
  let nums = [10, 20, 30];
  let index = 5;
  let found = vec.get(nums, index);

  match found {
    Some(value) => {
      return value
    },
    None => {
      io.println("missing index {index}");
      return 0
    }
  }

  return 0
}`
  ),
  singleFilePreset(
    'iterators',
    'Iterators',
    'Vec map, fold, and match',
    `import { io, vec } from "@std";

fn main() -> int {
  let nums = [1, 2, 3, 4];
  let doubled = map_vec(nums, |x| x * 2);
  let second = vec.get(doubled, 1);

  match second {
    Some(value) => {
      io.println("second={value}");
    },
    None => {
      io.println("missing");
    }
  }

  return doubled[0] + doubled[1] + doubled[2] + doubled[3]
}`
  ),
  singleFilePreset(
    'results',
    'Results',
    'Error flow with Result',
    `import { io } from "@std";

fn read_config(name: string) -> Result<string, string> {
  if (name == "lumina") {
    return Result.Ok("ready")
  }

  return Result.Err("missing")
}

fn main() -> int {
  let config = read_config("lumina");

  match config {
    Ok(value) => {
      io.println(value);
      return 1
    },
    Err(message) => {
      io.println(message);
      return 0
    }
  }

  return 0
}`
  ),
  singleFilePreset(
    'view-basic',
    'View',
    'DOM-shaped render output',
    `import { io } from "@std";

fn main() -> int {
  let view = "<main class=\\"app-shell\\">web native systems</main>";
  io.println(view);
  return 0
}`
  ),
  singleFilePreset(
    'keyed-ui',
    'Keyed UI',
    'Stable list identity and SSR keys',
    `import { io, render } from "@std";

fn main() -> int {
  let rows = render.signal(["draft", "review", "ship"]);

  let view = render.element("ol", render.props_class("task-list"), [
    for (row, index in rows key row) => render.element("li", props { class: "task-row" }, [
      render.text(row),
      render.text(":"),
      render.text(index)
    ])
  ]);

  io.println(render.render_to_string(view));
  return 0
}`
  ),
  singleFilePreset(
    'generic-keyed-ui',
    'Generic Keys',
    'Manual panel and branch identity',
    `import { io, render } from "@std";

fn main() -> int {
  let active = render.signal("profile");
  let first = render.get(active);
  let second = "settings";

  let view = render.element("section", props { class: "panels" }, [
    key(first) => render.element("article", props { class: "panel" }, [
      render.text("Profile")
    ]),
    key(second) => render.element("article", props { class: "panel" }, [
      render.text("Settings")
    ])
  ]);

  io.println(render.render_to_string(view));
  return 0
}`
  ),
  {
    id: 'starter-app',
    label: 'Starter App',
    detail: 'Router, loader, and multi-file shell',
    entryUri: 'main.lm',
    routeHref: '/dashboard?tab=team#activity',
    files: [
      {
        uri: 'main.lm',
        source: `import { io, render } from "@std";
import {
  createRouter,
  linkWithProps,
  prefetchRoute,
  routeLoader,
  routeResourceKey,
  routeStatus
} from "@std/router";
import { settingsSummary } from "./routes/settings.lm";

async fn loadDashboard() -> string {
  "ready"
}

fn main() -> int {
  let appRouter = createRouter("/");
  let dashboard = routeLoader(appRouter, "dashboard", || loadDashboard());
  let _settingsPrefetch = prefetchRoute(appRouter, "/settings", "dashboard", || loadDashboard());
  let view = render.element("main", props { class: "app-shell" }, [
    render.element("nav", props { class: "nav-row" }, [
      linkWithProps(appRouter, "/", props { class: "nav-link" }, [render.text("Home")]),
      linkWithProps(appRouter, "/settings", props { class: "nav-link" }, [render.text("Settings")])
    ]),
    render.element("p", props { class: "status" }, [
      render.text("Loader: "),
      render.text(routeStatus(dashboard))
    ]),
    render.element("p", props { class: "status" }, [
      render.text(settingsSummary())
    ])
  ]);

  io.println(routeResourceKey(appRouter, "dashboard"));
  io.println(render.render_to_string(view));
  return 0
}`,
      },
      {
        uri: 'routes/settings.lm',
        source: `pub fn settingsSummary() -> string {
  "Settings module ready"
}`,
      },
    ],
  },
  {
    id: 'forms-resource',
    label: 'Forms + Resource',
    detail: 'Field state, validation, and optimistic actions',
    entryUri: 'main.lm',
    routeHref: '/profile?mode=edit',
    files: [
      {
        uri: 'main.lm',
        source: `import { screen } from "./profile-workspace.lm";

fn main() -> VNode {
  screen()
}`,
      },
      {
        uri: 'profile-workspace.lm',
        source: `import { render } from "@std";
import { checkbox, textInput } from "@std/forms";
import { createResource, read, status } from "@std/resource";
import { loadName } from "./validators.lm";

pub fn screen() -> VNode {
  let name = render.signal("donald");
  let accepted = render.signal(false);
  let resource = createResource<string>("name", || loadName());

  render.fragment([
    render.element("p", render.props_class("resource-status"), [render.text(status(resource))]),
    render.element("input", textInput(name, render.props_class("profile-input")), []),
    render.element("input", checkbox(accepted, render.props_class("accepted")), []),
    render.element("p", render.props_class("resource-value"), [render.text(read(resource))])
  ])
}`,
      },
      {
        uri: 'validators.lm',
        source: `pub async fn loadName() -> string {
  "donald"
}`,
      },
    ],
  },
  {
    id: 'package-import',
    label: 'Package Import',
    detail: 'Bare package resolution through lumina.lock',
    entryUri: 'main.lm',
    files: [
      {
        uri: 'main.lm',
        source: `import { io } from "@std";
import { parse } from "json-utils";

fn main() -> int {
  io.println(parse());
  return 0
}`,
      },
      {
        uri: 'lumina.lock',
        source: `{
  "version": 1,
  "packages": {
    "json-utils@1.2.3": {
      "name": "json-utils",
      "version": "1.2.3",
      "resolved": "https://registry.example.dev/json-utils-1.2.3.tgz",
      "path": "./.lumina/packages/json-utils@1.2.3",
      "integrity": "sha256:test",
      "lumina": "./src/lib.lm",
      "deps": {}
    }
  }
}`,
      },
      {
        uri: '.lumina/packages/json-utils@1.2.3/src/lib.lm',
        source: `pub fn parse() -> string {
  "package:ok"
}`,
      },
    ],
  },
];

export const defaultPlaygroundPreset = playgroundPresets[0];

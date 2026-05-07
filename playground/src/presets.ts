export type PlaygroundPreset = {
  id: string;
  source: string;
};

export const playgroundPresets: PlaygroundPreset[] = [
  {
    id: 'basics',
    source: `import { io } from "@std";

fn square(x: int) -> int {
  return x * x
}

fn main() -> int {
  let answer = square(12);
  io.println("square={answer}");
  return answer
}`,
  },
  {
    id: 'safe-index',
    source: `import { io, vec } from "@std";

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
}`,
  },
  {
    id: 'iterators',
    source: `import { io, vec } from "@std";

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
}`,
  },
  {
    id: 'results',
    source: `import { io } from "@std";

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
}`,
  },
  {
    id: 'view-basic',
    source: `import { io } from "@std";

fn main() -> int {
  let view = "<main class=\\"app-shell\\">web native systems</main>";
  io.println(view);
  return 0
}`,
  },
  {
    id: 'keyed-ui',
    source: `import { io, render } from "@std";

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
}`,
  },
  {
    id: 'generic-keyed-ui',
    source: `import { io, render } from "@std";

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
}`,
  },
  {
    id: 'starter-app',
    source: `import { io, render } from "@std";
import {
  createRouter,
  linkWithProps,
  prefetchRoute,
  routeLoader,
  routeResourceKey,
  routeStatus
} from "@std/router";

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
    ])
  ]);

  io.println(routeResourceKey(appRouter, "dashboard"));
  io.println(render.render_to_string(view));
  return 0
}`,
  },
];

export const defaultPlaygroundPreset = playgroundPresets[0];

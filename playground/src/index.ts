import './style.css';
import './main.lm';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;

type CompileDiagnostic = {
  severity: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
};

type CompileResult = {
  ok: boolean;
  js: string;
  runnableJs: string;
  hasMain: boolean;
  diagnostics: CompileDiagnostic[];
};

type CompileLuminaSource = (source: string) => CompileResult;
type FormatLuminaSource = (source: string) => string;

type PlaygroundPreset = {
  id: string;
  source: string;
};

const presets: PlaygroundPreset[] = [
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

const defaultPreset = presets[0];
const storageKey = 'lumina-playground-source';
const isDirectPlaygroundDev = import.meta.env.DEV && window.location.port === '5175';
const devAppUrl = (port: string, path: string): string =>
  `${window.location.protocol}//${window.location.hostname}:${port}${path}`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string): string | null => {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const readSharedSource = (): string | null => {
  const encoded = new URL(window.location.href).searchParams.get('code');
  return encoded ? fromBase64Url(encoded) : null;
};

const readStoredSource = (): string | null => {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const writeStoredSource = (source: string): void => {
  try {
    window.localStorage.setItem(storageKey, source);
  } catch {
    // Storage is optional; sharing and compiling still work without it.
  }
};

const formatRuntimeValue = (value: unknown): string => {
  if (value === undefined) return 'void';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  if (value && typeof value === 'object' && '$tag' in value) {
    const tagged = value as { $tag: string; $payload?: unknown };
    return tagged.$payload === undefined
      ? tagged.$tag
      : `${tagged.$tag}(${formatRuntimeValue(tagged.$payload)})`;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setDataset = (id: string, key: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.dataset[key] = value;
};

const showToast = (message: string): void => {
  const toast = document.getElementById('toast-root');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.open = 'true';
  window.setTimeout(() => {
    delete toast.dataset.open;
  }, 1800);
};

const updateSourceStats = (source: string): void => {
  const lines = source.trim().length === 0 ? 0 : source.replace(/\n$/g, '').split('\n').length;
  setText('source-size', `${lines} ${lines === 1 ? 'line' : 'lines'}`);
};

const updateLinks = (): void => {
  const home = document.getElementById('home-link') as HTMLAnchorElement | null;
  const docs = document.getElementById('docs-link') as HTMLAnchorElement | null;
  if (home) home.href = isDirectPlaygroundDev ? devAppUrl('5173', '/') : '../';
  if (docs) docs.href = isDirectPlaygroundDev ? devAppUrl('5174', '/docs/') : '../docs/';
};

const renderDiagnostics = (element: HTMLElement, diagnostics: CompileDiagnostic[]): void => {
  if (diagnostics.length === 0) {
    element.innerHTML = '<p class="empty-state">No diagnostics.</p>';
    setText('diagnostic-count', '0');
    return;
  }

  setText('diagnostic-count', String(diagnostics.length));
  element.innerHTML = diagnostics
    .map((diagnostic) => {
      const locationParts = [
        diagnostic.line ? `line ${diagnostic.line}` : '',
        diagnostic.column ? `col ${diagnostic.column}` : '',
      ].filter(Boolean);
      const location =
        locationParts.length > 0
          ? `<span class="diagnostic-line">${escapeHtml(locationParts.join(', '))}</span>`
          : '';
      const code = diagnostic.code
        ? `<span class="diagnostic-code">${escapeHtml(diagnostic.code)}</span>`
        : '';
      return `
        <div class="diagnostic ${escapeHtml(diagnostic.severity)}">
          <div class="diagnostic-meta">
            <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
            ${code}
            ${location}
          </div>
          <p class="diagnostic-message">${escapeHtml(diagnostic.message)}</p>
        </div>
      `;
    })
    .join('');
};

const renderOutput = (element: HTMLElement, result: CompileResult): void => {
  if (result.ok) {
    element.textContent = result.js;
    return;
  }

  element.textContent = result.diagnostics
    .map((diagnostic) => {
      const prefix = diagnostic.line ? `line ${diagnostic.line}: ` : '';
      return `${prefix}${diagnostic.message}`;
    })
    .join('\n');
};

const copyText = async (value: string, successMessage: string): Promise<void> => {
  if (!value.trim()) {
    showToast('Nothing to copy yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    showToast('Clipboard is unavailable.');
  }
};

const createShareUrl = (source: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set('code', toBase64Url(source));
  return url.toString();
};

const setActivePreset = (presetId: string | null): void => {
  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    if (presetId && button.id === `preset-${presetId}`) button.dataset.active = 'true';
    else delete button.dataset.active;
  });
};

const runCompiledModule = async (result: CompileResult): Promise<string> => {
  if (!result.hasMain) return 'No main() function found.';

  const moduleSource = `${result.runnableJs}\nexport { main as __luminaMain };\n`;
  const blob = new Blob([moduleSource], { type: 'text/javascript' });
  const moduleUrl = URL.createObjectURL(blob);
  const logs: string[] = [];
  /* eslint-disable no-console */
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(formatRuntimeValue).join(' '));
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map(formatRuntimeValue).join(' '));
    originalError(...args);
  };

  try {
    const module = (await import(/* @vite-ignore */ moduleUrl)) as {
      __luminaMain?: () => unknown | Promise<unknown>;
    };
    const returned = await module.__luminaMain?.();
    if (returned !== undefined) logs.push(`return ${formatRuntimeValue(returned)}`);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    URL.revokeObjectURL(moduleUrl);
  }
  /* eslint-enable no-console */

  return logs.length > 0 ? logs.join('\n') : 'main() completed.';
};

const startPlayground = async (): Promise<void> => {
  updateLinks();

  await Promise.all([import('./codemirror-bridge'), import('./compiler-bridge')]);

  const bridge = globalThis as Record<string, unknown>;
  const mountEditor = bridge.mountEditor as MountEditor | undefined;
  const getEditorText = bridge.getEditorText as GetEditorText | undefined;
  const setEditorText = bridge.setEditorText as SetEditorText | undefined;
  const onEditorChange = bridge.onEditorChange as OnEditorChange | undefined;
  const compileLuminaSource = bridge.compileLuminaSource as CompileLuminaSource | undefined;
  const formatSource = bridge.formatLuminaSource as FormatLuminaSource | undefined;
  if (
    !mountEditor ||
    !getEditorText ||
    !setEditorText ||
    !onEditorChange ||
    !compileLuminaSource ||
    !formatSource
  ) {
    showToast('Playground tools did not load.');
    return;
  }

  const diagnosticsRoot = document.getElementById('diagnostics-root');
  const outputRoot = document.getElementById('output-root');
  const consoleRoot = document.getElementById('console-root');
  if (!diagnosticsRoot || !outputRoot || !consoleRoot) return;

  let lastResult: CompileResult | null = null;
  const initialSource = readSharedSource() ?? readStoredSource() ?? defaultPreset.source;
  const initialPreset = initialSource === defaultPreset.source ? defaultPreset.id : null;

  const compileAndRender = (): CompileResult => {
    const source = getEditorText('editor-root');
    updateSourceStats(source);
    writeStoredSource(source);
    const result = compileLuminaSource(source);
    lastResult = result;
    setText('compile-status', result.ok ? 'Compiled' : 'Needs attention');
    setDataset('compile-status', 'status', result.ok ? 'ok' : 'error');
    setText('output-mode', 'JS');
    renderDiagnostics(diagnosticsRoot, result.diagnostics);
    renderOutput(outputRoot, result);
    return result;
  };

  const runSource = async (): Promise<void> => {
    const result = compileAndRender();
    if (!result.ok) {
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      consoleRoot.textContent = 'Fix diagnostics before running.';
      return;
    }

    setText('run-status', 'Running');
    setDataset('run-status', 'status', 'running');
    try {
      consoleRoot.textContent = await runCompiledModule(result);
      setText('run-status', 'Done');
      setDataset('run-status', 'status', 'ok');
    } catch (error) {
      consoleRoot.textContent = error instanceof Error ? error.message : String(error);
      setText('run-status', 'Error');
      setDataset('run-status', 'status', 'error');
    }
  };

  mountEditor({
    elementId: 'editor-root',
    initialValue: initialSource,
  });
  setActivePreset(initialPreset);
  updateSourceStats(initialSource);

  let compileTimer: number | undefined;
  onEditorChange('editor-root', (value) => {
    setActivePreset(null);
    updateSourceStats(value);
    writeStoredSource(value);
    if (compileTimer) window.clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => {
      compileAndRender();
    }, 220);
  });

  document.getElementById('check-button')?.addEventListener('click', () => {
    compileAndRender();
    showToast('Checked.');
  });

  document.getElementById('run-button')?.addEventListener('click', () => {
    void runSource();
  });

  document.getElementById('format-button')?.addEventListener('click', () => {
    const formatted = formatSource(getEditorText('editor-root'));
    setEditorText('editor-root', formatted);
    compileAndRender();
    showToast('Formatted.');
  });

  document.getElementById('share-button')?.addEventListener('click', () => {
    const shareUrl = createShareUrl(getEditorText('editor-root'));
    window.history.replaceState(null, '', shareUrl);
    void copyText(shareUrl, 'Share link copied.');
  });

  document.getElementById('copy-js-button')?.addEventListener('click', () => {
    const result = lastResult ?? compileAndRender();
    void copyText(result.js, 'JavaScript copied.');
  });

  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedPresetId = button.id.startsWith('preset-')
        ? button.id.slice('preset-'.length)
        : '';
      const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
      if (!selectedPreset) return;

      setEditorText('editor-root', selectedPreset.source);
      setActivePreset(selectedPreset.id);
      compileAndRender();
    });
  });

  compileAndRender();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void startPlayground();
  });
} else {
  void startPlayground();
}

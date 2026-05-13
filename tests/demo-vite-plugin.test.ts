import fs from 'node:fs';
import path from 'node:path';
import { luminaPlugin } from '../demo/vite-plugin-lumina.js';

describe('demo vite plugin', () => {
  test('keeps the static home shell off router stdlib compilation path', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../demo/app.lm'), 'utf-8');
    const componentsSource = fs.readFileSync(path.resolve(__dirname, '../demo/components.lm'), 'utf-8');
    const examplesSource = fs.readFileSync(path.resolve(__dirname, '../demo/home-examples.lm'), 'utf-8');
    const playgroundAppSource = fs.readFileSync(path.resolve(__dirname, '../playground/src/app.lm'), 'utf-8');
    const playgroundSource = fs.readFileSync(path.resolve(__dirname, '../playground/src/index.ts'), 'utf-8');
    const playgroundControllerSource = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/playground-controller.ts'),
      'utf-8'
    );
    const playgroundExamplesSource = fs.readFileSync(path.resolve(__dirname, '../playground/src/examples-data.ts'), 'utf-8');
    const styleSource = fs.readFileSync(path.resolve(__dirname, '../demo/style.css'), 'utf-8');

    expect(componentsSource).not.toContain('@std/router');
    expect(appSource).toContain('"./docs/"');
    expect(appSource).toContain('"./playground/"');
    expect(appSource).not.toContain('"/docs/"');
    expect(appSource).not.toContain('"/playground/"');
    expect(examplesSource).toContain('./playground/?preset=basics');
    expect(examplesSource).toContain('./playground/?preset=results');
    expect(examplesSource).toContain('./playground/?preset=view-basic');
    expect(playgroundExamplesSource).toContain("'basics'");
    expect(playgroundExamplesSource).toContain("'counter'");
    expect(playgroundExamplesSource).toContain("'forms-store-resource'");
    expect(playgroundExamplesSource).toContain("'json-parser'");
    expect(playgroundAppSource).toContain('topbar()');
    expect(playgroundAppSource).toContain('editor_zone()');
    expect(playgroundSource).toContain('startPlayground');
    expect(playgroundControllerSource).toContain('readUrlState');
    expect(playgroundControllerSource).toContain("document.getElementById('examples-select')");
    expect(styleSource).toContain("@import 'tailwindcss' source(none);");
    expect(styleSource).toContain("@source './*.lm';");
  });

  test('resolves source-backed std modules beyond router', async () => {
    const plugin = luminaPlugin();
    const importer = path.resolve(__dirname, '../demo/main.lm');
    const routerPath = path.resolve(__dirname, '../std/router.lm');
    const testingPath = path.resolve(__dirname, '../std/testing.lm');
    const uiPath = path.resolve(__dirname, '../std/ui.lm');
    const devtoolsPath = path.resolve(__dirname, '../std/devtools.lm');
    const ssgPath = path.resolve(__dirname, '../std/ssg.lm');
    const renderPath = path.resolve(__dirname, '../std/render.lm');
    const workspace = fs.mkdtempSync(path.join(process.cwd(), '.tmp-demo-vite-plugin-'));
    const entryPath = path.join(workspace, 'main.lm');
    fs.writeFileSync(
      path.join(workspace, 'helper.lm'),
      `
        pub fn localValue() -> string {
          "local"
        }
      `.trim() + '\n',
      'utf-8'
    );
    fs.writeFileSync(
      entryPath,
      `
        import { createDomHarness } from "@std/testing";
        import { text } from "@std/render";
        import { localValue } from "./helper.lm";

        pub fn main() -> VNode {
          let _ = createDomHarness();
          text(localValue())
        }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      expect(plugin.resolveId?.('@std/router', importer)).toBe(routerPath);
      expect(plugin.resolveId?.('@std/testing', importer)).toBe(testingPath);
      expect(plugin.resolveId?.('@std/ui', importer)).toBe(uiPath);
      expect(plugin.resolveId?.('@std/devtools', importer)).toBe(devtoolsPath);
      expect(plugin.resolveId?.('@std/ssg', importer)).toBe(ssgPath);
      expect(plugin.resolveId?.('@std/render', importer)).toBe(renderPath);

      const code = await plugin.load?.call(
        {
          error(message: string) {
            throw new Error(message);
          },
        },
        entryPath
      );

      expect(typeof code).toBe('string');
      expect(code).toContain('export {');
      expect(code).toContain('createDomHarness');
      expect(code).toContain('localValue');
      expect(code).toContain('./helper.lm');
      expect(code).toContain('lumina-runtime.js');
      expect(code).not.toContain('std/render.lm');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('resolves extensionless local Lumina imports through the plugin path', async () => {
    const plugin = luminaPlugin();
    const workspace = fs.mkdtempSync(path.join(process.cwd(), '.tmp-demo-vite-plugin-ext-'));
    const entryPath = path.join(workspace, 'main.lm');
    const helperPath = path.join(workspace, 'helper.lm');
    fs.writeFileSync(
      helperPath,
      `pub fn localValue() -> string { "local" }\n`,
      'utf-8'
    );
    fs.writeFileSync(
      entryPath,
      `
        import { localValue } from "./helper";

        pub fn main() -> VNode {
          localValue()
        }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      expect(plugin.resolveId?.('./helper', entryPath)).toBe(helperPath);
      const code = await plugin.load?.call(
        {
          error(message: string) {
            throw new Error(message);
          },
        },
        entryPath
      );
      expect(typeof code).toBe('string');
      expect(code).toContain('localValue');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('resolves bare package imports from lumina.lock during Vite compilation', async () => {
    const plugin = luminaPlugin();
    const workspace = fs.mkdtempSync(path.join(process.cwd(), '.tmp-demo-vite-plugin-pkg-'));
    const entryPath = path.join(workspace, 'main.lm');
    const pkgRoot = path.join(workspace, '.lumina', 'packages', 'json-utils@1.2.3');
    const pkgEntry = path.join(pkgRoot, 'src', 'lib.lm');

    fs.mkdirSync(path.dirname(pkgEntry), { recursive: true });
    fs.writeFileSync(pkgEntry, 'pub fn parse() -> string { "ok" }\n', 'utf-8');
    fs.writeFileSync(
      path.join(workspace, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'json-utils@1.2.3': {
              name: 'json-utils',
              version: '1.2.3',
              resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
              path: './.lumina/packages/json-utils@1.2.3',
              integrity: 'sha256:test',
              lumina: './src/lib.lm',
              deps: {},
            },
          },
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    fs.writeFileSync(
      entryPath,
      `
        import { parse } from "json-utils";

        pub fn main() -> VNode {
          parse()
        }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      expect(plugin.resolveId?.('json-utils', entryPath)).toBe(pkgEntry);
      const code = await plugin.load?.call(
        {
          error(message: string) {
            throw new Error(message);
          },
        },
        entryPath
      );
      expect(typeof code).toBe('string');
      expect(code).toContain('.lumina/packages/json-utils@1.2.3/src/lib.lm');
      expect(code).not.toContain('from "json-utils"');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('compiles the source-backed router std module without stalling', async () => {
    const plugin = luminaPlugin();
    const routerPath = path.resolve(__dirname, '../std/router.lm');
    const startedAt = Date.now();

    const code = await plugin.load?.call(
      {
        error(message: string) {
          throw new Error(message);
        },
      },
      routerPath
    );

    expect(Date.now() - startedAt).toBeLessThan(10000);
    expect(typeof code).toBe('string');
    expect(code).toContain('createRouter');
    expect(code).toContain('routeTree');
    expect(code).toContain('export {');
  }, 15000);

  test('exposes a virtual route manifest with lazy route imports', async () => {
    const plugin = luminaPlugin();
    const workspace = fs.mkdtempSync(path.join(process.cwd(), '.tmp-demo-vite-plugin-routes-'));
    const appPath = path.join(workspace, 'src', 'app.lm');
    const settingsPath = path.join(workspace, 'src', 'routes', 'settings.lm');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, 'pub fn Settings() -> string { "settings" }\n', 'utf-8');
    fs.writeFileSync(
      appPath,
      `
        import { render } from "@std";
        import { routeNode, routeNodeWithChildren, lazyRouteModule } from "@std/router";

        pub fn routes() -> any {
          let home = routeNode("home", "/", "Home")
          let projects = routeNodeWithChildren("projects", "/projects", "Projects", render.props_empty())
          let settings = lazyRouteModule("settings", "/settings", "Settings", "./routes/settings.lm")
          home
        }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      plugin.configResolved?.({ root: workspace });
      const resolved = await plugin.resolveId?.('virtual:lumina-routes');
      expect(resolved).toBe('\0virtual:lumina-routes');

      const code = await plugin.load?.call(
        {
          error(message: string) {
            throw new Error(message);
          },
        },
        String(resolved)
      );

      expect(typeof code).toBe('string');
      expect(code).toContain('export const routes');
      expect(code).toContain('"id": "home"');
      expect(code).toContain('"id": "projects"');
      expect(code).toContain('"id": "settings"');
      expect(code).toContain('"lazy": true');
      expect(code).toContain('"/src/routes/settings.lm"');
      expect(code).toContain('"settings": () => import("/src/routes/settings.lm")');
      expect(code).toContain('export const duplicateRouteIds = []');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }, 15000);
});

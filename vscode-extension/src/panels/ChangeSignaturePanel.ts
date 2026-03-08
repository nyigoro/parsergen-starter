import type { ChangeSignaturePreview, ParamChange } from 'lumina-language-client';
import { getVscode } from '../vscode-shim.js';

export type { ParamChange } from 'lumina-language-client';

type ExtensionContextLike = {
  extensionUri: unknown;
};

type WebviewPanelLike = {
  title: string;
  reveal(column?: unknown): void;
  dispose(): void;
  onDidDispose(listener: () => void): void;
  webview: {
    cspSource: string;
    html: string;
    postMessage(message: unknown): Promise<boolean>;
    onDidReceiveMessage(listener: (message: { type?: string; params?: ParamInfo[] }) => void | Promise<void>): void;
  };
};

export type ParamInfo = {
  id?: string;
  name: string;
  type: string | null;
};

export type ChangeSignaturePreviewInfo = {
  callSiteCount: number;
  fileCount: number;
  warnings: string[];
};

type NormalizedParamInfo = {
  id: string;
  name: string;
  type: string;
};

function normalizeParam(param: ParamInfo, index: number): NormalizedParamInfo {
  return {
    id: param.id ?? `param-${index}`,
    name: param.name.trim() || `param${index + 1}`,
    type: (param.type ?? '').trim() || '_',
  };
}

export function withParamIds(params: ParamInfo[]): NormalizedParamInfo[] {
  return params.map((param, index) => normalizeParam(param, index));
}

export function renderSignaturePreview(fnName: string, params: ParamInfo[]): string {
  const rendered = withParamIds(params).map((param) => `${param.name}: ${param.type}`).join(', ');
  return `fn ${fnName}(${rendered})`;
}

export function summarizeParamChanges(changes: ParamChange[]): string {
  const counts = { rename: 0, reorder: 0, add: 0, remove: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return `${counts.rename} rename${counts.rename === 1 ? '' : 's'}, ${counts.reorder} reorder${counts.reorder === 1 ? '' : 's'}, ${counts.add} addition${counts.add === 1 ? '' : 's'}, ${counts.remove} removal${counts.remove === 1 ? '' : 's'}`;
}

export function buildParamChanges(originalParams: ParamInfo[], currentParams: ParamInfo[]): ParamChange[] {
  const original = withParamIds(originalParams);
  const current = withParamIds(currentParams);
  const originalById = new Map(original.map((param, index) => [param.id, { param, index }]));
  const currentExistingIds = new Set(current.filter((param) => originalById.has(param.id)).map((param) => param.id));
  const changes: ParamChange[] = [];

  for (const [index, originalParam] of original.entries()) {
    const currentParam = current.find((param) => param.id === originalParam.id);
    if (currentParam && currentParam.name !== originalParam.name) {
      changes.push({
        kind: 'rename',
        index,
        oldName: originalParam.name,
        newName: currentParam.name,
      });
    }
  }

  for (let index = original.length - 1; index >= 0; index -= 1) {
    if (!currentExistingIds.has(original[index].id)) {
      changes.push({ kind: 'remove', index });
    }
  }

  const working = original.filter((param) => currentExistingIds.has(param.id)).map((param) => param.id);
  for (let targetIndex = 0; targetIndex < current.length; targetIndex += 1) {
    const param = current[targetIndex];
    if (!originalById.has(param.id)) {
      changes.push({ kind: 'add', index: targetIndex, name: param.name, type: param.type });
      working.splice(targetIndex, 0, param.id);
      continue;
    }
    const currentIndex = working.indexOf(param.id);
    if (currentIndex >= 0 && currentIndex !== targetIndex) {
      changes.push({ kind: 'reorder', fromIndex: currentIndex, toIndex: targetIndex });
      const [moved] = working.splice(currentIndex, 1);
      working.splice(targetIndex, 0, moved);
    }
  }

  return changes;
}

type PanelHandlers = {
  onPreview: (changes: ParamChange[]) => Promise<ChangeSignaturePreviewInfo | ChangeSignaturePreview>;
  onConfirm: (changes: ParamChange[]) => Promise<{ success: boolean; message: string }>;
};

function createNonce(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let nonce = '';
  for (let i = 0; i < 16; i += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}

function getHtml(webview: { cspSource: string }): string {
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Change Signature</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 1.1rem; margin: 0 0 12px; }
    .row { display: grid; grid-template-columns: 30px 30px 1fr 1fr 32px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .row input { width: 100%; padding: 6px 8px; color: inherit; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    button { padding: 6px 10px; }
    .preview, .impact, .warnings, .summary { margin-top: 14px; padding: 10px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .muted { opacity: 0.8; }
    ul { margin: 8px 0 0 18px; padding: 0; }
  </style>
</head>
<body>
  <h1 id="title">Change Signature</h1>
  <div id="rows"></div>
  <button id="add">+ Add parameter</button>
  <div class="preview"><strong>Preview</strong><div id="previewText" class="muted"></div></div>
  <div class="summary"><strong>Diff summary</strong><div id="summaryText" class="muted"></div></div>
  <div class="impact"><strong>Impact</strong><div id="impactText" class="muted"></div></div>
  <div class="warnings"><strong>Warnings</strong><div id="warningsText" class="muted"></div></div>
  <div class="actions">
    <button id="cancel">Cancel</button>
    <button id="apply">Apply Changes</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialState = vscode.getState() || { fnName: '', params: [], preview: '', summary: '', impact: '', warnings: [] };
    const state = { ...initialState };
    let previewTimer = null;

    function render() {
      document.getElementById('title').textContent = state.fnName ? 'Change Signature: ' + state.fnName : 'Change Signature';
      const rows = document.getElementById('rows');
      rows.innerHTML = '';
      state.params.forEach((param, index) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = ''
          + '<button data-action="up" data-index="' + index + '" ' + (index === 0 ? 'disabled' : '') + '>↑</button>'
          + '<button data-action="down" data-index="' + index + '" ' + (index === state.params.length - 1 ? 'disabled' : '') + '>↓</button>'
          + '<input data-field="name" data-index="' + index + '" value="' + escapeHtml(param.name || '') + '" placeholder="name" />'
          + '<input data-field="type" data-index="' + index + '" value="' + escapeHtml(param.type || '') + '" placeholder="type" />'
          + '<button data-action="delete" data-index="' + index + '">🗑</button>';
        rows.appendChild(row);
      });
      document.getElementById('previewText').textContent = state.preview || 'Waiting for preview...';
      document.getElementById('summaryText').textContent = state.summary || 'No pending changes';
      document.getElementById('impactText').textContent = state.impact || 'No call site data yet';
      const warnings = document.getElementById('warningsText');
      if (state.warnings && state.warnings.length > 0) {
        warnings.innerHTML = '<ul>' + state.warnings.map((warning) => '<li>' + escapeHtml(warning) + '</li>').join('') + '</ul>';
      } else {
        warnings.textContent = 'No warnings';
      }
      vscode.setState(state);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        vscode.postMessage({ type: 'preview', params: state.params });
      }, 120);
    }

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const index = Number(target.dataset.index);
      if (action === 'up' && index > 0) {
        const next = [...state.params];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        state.params = next;
        render();
        schedulePreview();
      }
      if (action === 'down' && index < state.params.length - 1) {
        const next = [...state.params];
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
        state.params = next;
        render();
        schedulePreview();
      }
      if (action === 'delete') {
        state.params = state.params.filter((_, currentIndex) => currentIndex !== index);
        render();
        schedulePreview();
      }
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const field = target.dataset.field;
      const index = Number(target.dataset.index);
      if (!field || Number.isNaN(index) || !state.params[index]) return;
      state.params[index] = { ...state.params[index], [field]: target.value };
      schedulePreview();
    });

    document.getElementById('add').addEventListener('click', () => {
      state.params = [...state.params, { id: 'new-' + Date.now() + '-' + state.params.length, name: '', type: '' }];
      render();
      schedulePreview();
    });
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('apply').addEventListener('click', () => vscode.postMessage({ type: 'confirm', params: state.params }));

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'init') {
        state.fnName = message.fnName;
        state.params = message.params;
        render();
        schedulePreview();
      }
      if (message.type === 'previewResult') {
        state.preview = message.preview;
        state.summary = message.summary;
        state.impact = message.impact;
        state.warnings = message.warnings || [];
        render();
      }
      if (message.type === 'applyResult' && !message.success) {
        state.warnings = [message.message];
        render();
      }
    });

    render();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

export class ChangeSignaturePanel {
  private static currentPanel: ChangeSignaturePanel | undefined;

  static createOrShow(
    context: ExtensionContextLike,
    fnName: string,
    params: ParamInfo[],
    handlers: PanelHandlers
  ): void {
    const vscode = getVscode();
    const column = vscode.window.activeTextEditor?.viewColumn;
    const initialParams = withParamIds(params);
    if (ChangeSignaturePanel.currentPanel) {
      ChangeSignaturePanel.currentPanel.panel.reveal(column);
      ChangeSignaturePanel.currentPanel.update(fnName, initialParams, handlers);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'lumina.changeSignature',
      `Change Signature: ${fnName}`,
      column ?? vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    ) as WebviewPanelLike;
    ChangeSignaturePanel.currentPanel = new ChangeSignaturePanel(panel, fnName, initialParams, handlers);
  }

  private constructor(
    private readonly panel: WebviewPanelLike,
    private fnName: string,
    private initialParams: NormalizedParamInfo[],
    private handlers: PanelHandlers
  ) {
    this.panel.webview.html = getHtml(this.panel.webview);
    this.panel.onDidDispose(() => {
      if (ChangeSignaturePanel.currentPanel === this) {
        ChangeSignaturePanel.currentPanel = undefined;
      }
    });
    this.panel.webview.onDidReceiveMessage(async (message: { type?: string; params?: ParamInfo[] }) => {
      if (message.type === 'ready') {
        this.postInit();
        return;
      }
      if (message.type === 'cancel') {
        this.panel.dispose();
        return;
      }
      if (message.type === 'preview') {
        const currentParams = withParamIds(message.params ?? []);
        const changes = buildParamChanges(this.initialParams, currentParams);
        const preview = await this.handlers.onPreview(changes);
        await this.panel.webview.postMessage({
          type: 'previewResult',
          preview: renderSignaturePreview(this.fnName, currentParams),
          summary: summarizeParamChanges(changes),
          impact: `Updates ${preview.callSiteCount} call site(s) across ${preview.fileCount} file(s)`,
          warnings: preview.warnings,
        });
        return;
      }
      if (message.type === 'confirm') {
        const currentParams = withParamIds(message.params ?? []);
        const changes = buildParamChanges(this.initialParams, currentParams);
        const result = await this.handlers.onConfirm(changes);
        await this.panel.webview.postMessage({ type: 'applyResult', success: result.success, message: result.message });
        if (result.success) {
          this.panel.dispose();
        }
      }
    });
  }

  private postInit(): void {
    void this.panel.webview.postMessage({
      type: 'init',
      fnName: this.fnName,
      params: this.initialParams,
    });
  }

  private update(fnName: string, params: NormalizedParamInfo[], handlers: PanelHandlers): void {
    this.fnName = fnName;
    this.initialParams = params;
    this.handlers = handlers;
    this.panel.title = `Change Signature: ${fnName}`;
    this.postInit();
  }
}

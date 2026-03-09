import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

export type SecretFinding = {
  file: string;
  line: number;
  column: number;
  kind: string;
  preview: string;
};

export type SecretScanResult = {
  findings: SecretFinding[];
  scanned: number;
};

type SecretPattern = {
  kind: string;
  pattern: RegExp;
};

const DEFAULT_IGNORE = ['.git/**', '.lumina/**', '.tmp/**', 'dist/**', 'node_modules/**', 'test-results/**'];
const DEFAULT_PATTERNS = [
  '.env',
  '.env.*',
  '**/*.lm',
  '**/*.ts',
  '**/*.js',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.json',
  '**/*.toml',
  '**/*.yaml',
  '**/*.yml',
];

export const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g },
  { kind: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g },
  { kind: 'stripe-secret', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g },
  { kind: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'database-url', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^/\s@]+@[^/\s]+/gi },
  { kind: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
  {
    kind: 'generic-secret',
    pattern:
      /\b(?:secret|token|api[_-]?key|access[_-]?key|password|passwd|client[_-]?secret)\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi,
  },
];

export function redact(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const parts = before.split('\n');
  return {
    line: parts.length,
    column: parts[parts.length - 1].length + 1,
  };
}

export function scanText(text: string, filename: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { kind, pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const hit = match[0];
      const { line, column } = lineColumnAt(text, match.index);
      findings.push({
        file: filename,
        line,
        column,
        kind,
        preview: redact(hit),
      });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
  return findings;
}

export async function loadLuminaIgnore(dir: string): Promise<Set<string>> {
  const ignorePath = path.join(dir, '.luminaignore');
  if (!existsSync(ignorePath)) return new Set();
  const raw = await fs.readFile(ignorePath, 'utf-8');
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  );
}

export async function scanDirectory(dir: string, extensions: string[] = DEFAULT_PATTERNS): Promise<SecretScanResult> {
  const cwd = path.resolve(dir);
  const ignore = [...DEFAULT_IGNORE, ...Array.from(await loadLuminaIgnore(cwd))];
  const files = await fg(extensions, {
    cwd,
    dot: true,
    onlyFiles: true,
    unique: true,
    ignore,
  });
  const findings: SecretFinding[] = [];
  for (const relativePath of files) {
    const absolutePath = path.join(cwd, relativePath);
    const text = await fs.readFile(absolutePath, 'utf-8').catch(() => null);
    if (text === null) continue;
    findings.push(...scanText(text, relativePath.replace(/\\/g, '/')));
  }
  return { findings, scanned: files.length };
}

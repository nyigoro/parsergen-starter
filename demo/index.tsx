import React, { useState, useEffect, useRef, FC } from 'react';
import { createRoot } from 'react-dom/client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { StreamLanguage } from '@codemirror/language';
import {
  ChevronDown,
  ChevronRight,
  Play,
  Download,
  Upload,
  Info,
  Code,
  Zap,
  FileText,
  TreePine,
  AlertCircle,
  CheckCircle,
  XCircle,
  Copy
} from 'lucide-react';
import PEG from 'peggy';
import luminaGrammarRaw from '../src/grammar/lumina.peg?raw';
import preludeRaw from '../std/prelude.lm?raw';
import { BrowserProjectContext } from '../src/project/browser-context';
import { compileGrammar as compileLuminaGrammar } from '../src/grammar/index';
import { lowerLumina } from '../src/lumina/lower';
import { optimizeIR } from '../src/lumina/optimize';
import { generateJS } from '../src/lumina/codegen';

const defaultGrammar = `Expression
  = left:Term _ operator:("+" / "-") _ right:Expression {
      return { type: 'Expression', operator, left, right };
    }
  / Term

Term
  = left:Factor _ operator:("*" / "/") _ right:Term {
      return { type: 'Expression', operator, left, right };
    }
  / Factor

Factor
  = "(" _ expr:Expression _ ")" { return expr; }
  / Number

Number
  = _ [0-9]+ {
      return { type: 'Number', value: parseInt(text(), 10) };
    }

_ = [ \\t\\n\\r]*`;

const examples = [
  { name: 'Simple Math', code: '3 + 4 * (2 - 1)', description: 'Basic arithmetic expression' },
  { name: 'Complex Expression', code: '((5 + 3) * 2) / (4 - 1)', description: 'Nested parentheses' },
  { name: 'Single Number', code: '42', description: 'Just a number' },
  { name: 'Error Case', code: '3 + error', description: 'Demonstrates error handling' },
];

const presets = [
  { name: 'Math Calculator', grammar: defaultGrammar },
  { name: 'JSON Parser', grammar: 'Object\n  = "{" pairs:Pair* "}" { return Object.fromEntries(pairs); }\n\nPair\n  = key:String ":" value:Value { return [key, value]; }' },
  { name: 'Simple Language', grammar: 'Program\n  = Statement*\n\nStatement\n  = Assignment / Expression' },
];

const luminaSample = `import { io } from "@std";
import { add } from "lib/math.lm";

struct User { id: int, name: string }
enum Result { Ok(int), Err(string) }

fn total(cost: int, tax: int) {
  return cost + tax;
}

fn main() {
  let cost = 400;
  let tax = 20;
  let answer = add(total(cost, tax), 0);
  return answer;
}`;

type LuminaPreset = {
  name: string;
  description: string;
  code: string;
};

const luminaPresets: LuminaPreset[] = [
  {
    name: 'String Interpolation',
    description: 'String templates + stdlib usage',
    code: `import { io } from "@std";

fn main() -> void {
  let name = "Lumina";
  let version = "0.3.x";
  io.println("Hello {name}, release line {version}");
}`,
  },
  {
    name: 'Traits + Impl',
    description: 'Trait declaration and method dispatch',
    code: `trait Printable {
  fn debug(self: Self) -> string;
}

struct User {
  name: string
}

impl Printable for User {
  fn debug(self: Self) -> string {
    self.name
  }
}

fn main() -> void {
  let user = User { name: "Ada" };
  let text = user.debug();
}`,
  },
  {
    name: 'Channels + Async',
    description: 'Message passing primitives',
    code: `import { channel } from "@std";

async fn main() -> void {
  let ch = channel.new<i32>();
  let sent = channel.send(ch.sender, 42);
  let _ = sent;
}`,
  },
  {
    name: 'WASM Numeric Hot Path',
    description: 'Recursive computation for wasm target',
    code: `fn fib(n: i32) -> i32 {
  if n <= 1 { n } else { fib(n - 1) + fib(n - 2) }
}

fn main() -> i32 {
  fib(20)
}`,
  },
];

type RuntimeSupport = 'stable' | 'partial' | 'node' | 'planned';
type RuntimeFeatureRow = {
  feature: string;
  browser: RuntimeSupport;
  node: RuntimeSupport;
  notes: string;
};

const runtimeMatrix: RuntimeFeatureRow[] = [
  { feature: 'io/str/math/list', browser: 'stable', node: 'stable', notes: 'Core runtime modules' },
  { feature: 'fs', browser: 'partial', node: 'stable', notes: 'Node full; browser returns Result.Err for writes/metadata' },
  { feature: 'time', browser: 'stable', node: 'stable', notes: 'Monotonic + wall clock helpers' },
  { feature: 'regex', browser: 'stable', node: 'stable', notes: 'RegExp wrappers with Result/Option' },
  { feature: 'crypto', browser: 'stable', node: 'stable', notes: 'WebCrypto + Node fallback' },
  { feature: 'channel', browser: 'stable', node: 'stable', notes: 'MessageChannel-based channels' },
  { feature: 'thread', browser: 'partial', node: 'stable', notes: 'Worker availability varies by host' },
  { feature: 'sync/atomics', browser: 'partial', node: 'stable', notes: 'Requires SharedArrayBuffer + Atomics' },
  { feature: 'wasm backend', browser: 'partial', node: 'stable', notes: 'Compile in CLI; run in both hosts' },
];

const supportBadgeClasses: Record<RuntimeSupport, string> = {
  stable: 'bg-green-700/40 text-green-300 border-green-600',
  partial: 'bg-yellow-700/30 text-yellow-300 border-yellow-600',
  node: 'bg-blue-700/30 text-blue-300 border-blue-600',
  planned: 'bg-gray-700/50 text-gray-300 border-gray-600',
};

const pegLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\/\/.*/)) return 'comment';
    if (stream.match(/"(?:\\.|[^"])*"/)) return 'string';
    if (stream.match(/'(?:\\.|[^'])*'/)) return 'string';
    if (stream.match(/\[[^\]]*\]/)) return 'string';
    if (stream.match(/[_a-zA-Z][_a-zA-Z0-9]*/)) return 'variableName';
    if (stream.match(/[:=(){}/*+?]|\/+/)) return 'operator';
    stream.next();
    return null;
  }
});

interface TreeNode {
  name: string;
  children?: TreeNode[];
  type?: string;
  value?: unknown;
}

const transformToTree = (node: unknown, depth = 0): TreeNode => {
  if (typeof node !== 'object' || node === null) {
    return { name: String(node), type: 'literal' };
  }

  if (Array.isArray(node)) {
    return {
      name: `Array[${node.length}]`,
      type: 'array',
      children: node.map((item, i) => ({
        name: `[${i}]`,
        children: [transformToTree(item, depth + 1)]
      }))
    };
  }

  const nodeObj = node as Record<string, unknown>;
  const children = Object.entries(nodeObj)
    .filter(([key]) => key !== 'type')
    .map(([key, value]) => ({
      name: key,
      children: [transformToTree(value, depth + 1)]
    }));

  return {
    name: (nodeObj as { type?: string }).type || 'Object',
    type: 'object',
    children: children.length > 0 ? children : undefined
  };
};

interface TreeVisualizationProps {
  data: TreeNode | null;
  onNodeClick: (node: TreeNode, path: string) => void;
}

const TreeVisualization: FC<TreeVisualizationProps> = ({ data, onNodeClick }) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set<string>());

  const toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: TreeNode, path = '', depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(path);

    return (
      <div key={path} className="tree-node">
        <div
          className="flex items-center py-1 px-2 hover:bg-gray-600 rounded cursor-pointer transition-colors"
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => {
            if (hasChildren) toggleNode(path);
            onNodeClick?.(node, path);
          }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <div className="w-4" />
          )}
          <span className={`ml-2 font-mono text-sm ${
            node.type === 'literal' ? 'text-green-400' :
            node.type === 'array' ? 'text-blue-400' : 'text-yellow-400'
          }`}>
            {node.name}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children!.map((child, i) =>
              renderNode(child, `${path}/${i}`, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (data) {
      setExpandedNodes(new Set(['0']));
    }
  }, [data]);

  return (
    <div className="tree-container h-full overflow-auto text-sm">
      {data ? renderNode(data) : <p className="text-gray-400 p-4">No AST data</p>}
    </div>
  );
};

interface ParsePerformance {
  time: number;
  nodes: number;
}

interface SessionData {
  grammar?: string;
  code?: string;
  output?: string;
  timestamp?: string;
}

const PerformanceSparkline: FC<{ data: number[] }> = ({ data }) => {
  if (data.length < 2) return <div className="text-xs text-gray-400">No history</div>;
  const width = 120;
  const height = 24;
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke="#60A5FA"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

type Route = 'home' | 'playground' | 'lumina';

interface DemoParseError {
  error: string;
  location?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  expected?: string[];
  found?: string | null;
  input?: string;
}

interface DemoParseResult<T> {
  result: T;
}

interface LuminaDiagnostic {
  severity: string;
  message: string;
  location?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  code?: string;
}

const dedupeDiagnostics = (items: LuminaDiagnostic[]): LuminaDiagnostic[] => {
  const seen = new Set<string>();
  const result: LuminaDiagnostic[] = [];
  for (const item of items) {
    const loc = item.location;
    const key = [
      item.severity,
      item.code ?? '',
      item.message,
      loc?.start.line ?? 0,
      loc?.start.column ?? 0,
      loc?.end.line ?? 0,
      loc?.end.column ?? 0,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const compilePegParser = (grammar: string) => {
  const parser = PEG.generate(grammar, {
    output: 'parser',
    format: 'bare',
    optimize: 'speed'
  });
  return parser;
};

const parseInput = <T,>(parser: { parse: (input: string) => T }, input: string): DemoParseResult<T> | DemoParseError => {
  try {
    return { result: parser.parse(input) };
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const err = error as { message: string; location?: DemoParseError['location']; expected?: string[]; found?: string | null };
      return {
        error: err.message,
        location: err.location,
        expected: err.expected,
        found: err.found ?? null,
        input
      };
    }
    return { error: 'Unknown parse error', input };
  }
};

const formatError = (error: DemoParseError): string => {
  const parts = [`Parse Error: ${error.error}`];
  if (error.location) {
    const { start, end } = error.location;
    parts.push(`At ${start.line}:${start.column} → ${end.line}:${end.column}`);
  }
  if (error.expected && error.expected.length > 0) {
    parts.push(`Expected: ${error.expected.join(', ')}`);
  }
  if (error.found !== undefined && error.found !== null) {
    parts.push(`Found: "${error.found}"`);
  }
  return parts.join('\n');
};

const getRouteFromHash = (): Route => {
  if (typeof window === 'undefined') return 'home';
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (raw === 'playground' || raw === 'lumina') return raw;
  return 'home';
};

function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());
  const [code, setCode] = useState('3 + 4 * (2 - 1)');
  const [grammar, setGrammar] = useState(defaultGrammar);
  const [output, setOutput] = useState('');
  const [ast, setAst] = useState<TreeNode | null>(null);
  const [activeTab, setActiveTab] = useState('output');
  const [sidebarTab, setSidebarTab] = useState('examples');
  const [parseStatus, setParseStatus] = useState('idle');
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ node: TreeNode; path: string } | null>(null);
  const [autoparse, setAutoparse] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [performance, setPerformance] = useState<ParsePerformance | null>(null);
  const [parseHistory, setParseHistory] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [luminaCode, setLuminaCode] = useState(luminaSample);
  const [luminaPreset, setLuminaPreset] = useState(0);
  const [luminaAst, setLuminaAst] = useState<unknown>(null);
  const [luminaDiagnostics, setLuminaDiagnostics] = useState<LuminaDiagnostic[]>([]);
  const [luminaOutput, setLuminaOutput] = useState('');
  const [luminaStatus, setLuminaStatus] = useState<'idle' | 'parsing' | 'error' | 'ok'>('idle');
  const [luminaTab, setLuminaTab] = useState<'ast' | 'diagnostics' | 'js'>('diagnostics');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    const handleHash = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = (next: Route) => {
    if (next === 'home') {
      window.location.hash = '';
    } else {
      window.location.hash = next;
    }
    setRoute(next);
  };

  const handleParse = () => {
    const startTime = window.performance.now();
    setParseStatus('parsing');
    setGrammarError(null);

    try {
      const parser = compilePegParser(grammar);
      const result: DemoParseResult<unknown> | DemoParseError = parseInput(parser, code);
      const endTime = window.performance.now();

      if ('result' in result) {
        const jsonOutput = JSON.stringify(result.result, null, 2);
        setOutput(jsonOutput);
        const tree = transformToTree(result.result);
        setAst(tree);
        setParseStatus('success');
        const elapsed = endTime - startTime;
        setPerformance({ time: elapsed, nodes: countNodes(result.result) });
        setParseHistory(prev => [...prev, elapsed].slice(-30));
      } else {
        setOutput(formatError(result));
        setAst(null);
        setParseStatus('error');
        const elapsed = endTime - startTime;
        setPerformance({ time: elapsed, nodes: 0 });
        setParseHistory(prev => [...prev, elapsed].slice(-30));
      }
    } catch (error) {
      if (error instanceof Error) {
        setOutput(`Error: ${error.message}`);
        setGrammarError(error.message);
      } else {
        setOutput('Unknown error occurred');
      }
      setAst(null);
      setParseStatus('error');
      const elapsed = window.performance.now() - startTime;
      setPerformance({ time: elapsed, nodes: 0 });
      setParseHistory(prev => [...prev, elapsed].slice(-30));
    }
  };

  const handleLuminaParse = () => {
    setLuminaStatus('parsing');
    setLuminaDiagnostics([]);
    setLuminaOutput('');

    try {
      const parser = compileLuminaGrammar(luminaGrammarRaw);
      const project = new BrowserProjectContext(parser, { preludeText: preludeRaw });
      project.registerVirtualFile('lib/math.lm', 'pub fn add(a: int, b: int) -> int { return a + b; }');
      project.addOrUpdateDocument('main.lm', luminaCode, 1);

      const diagnostics = dedupeDiagnostics(project.getDiagnostics('main.lm') as LuminaDiagnostic[]);
      const ast = project.getDocumentAst('main.lm');
      setLuminaAst(ast ?? null);
      setLuminaDiagnostics(diagnostics);

      if (ast && typeof ast === 'object') {
        const lowered = lowerLumina(ast as never);
        const optimized = optimizeIR(lowered);
        const js = optimized ? generateJS(optimized).code : '// IR optimized away';
        setLuminaOutput(js);
      } else {
        setLuminaOutput('');
      }
      setLuminaStatus(diagnostics.length > 0 ? 'error' : 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLuminaDiagnostics([{ severity: 'error', message }]);
      setLuminaStatus('error');
    }
  };

  const countNodes = (node: unknown): number => {
    if (typeof node !== 'object' || node === null) return 1;
    if (Array.isArray(node)) return node.reduce((sum: number, item: unknown) => sum + countNodes(item), 0);
    return 1 + Object.values(node as Record<string, unknown>).reduce((sum: number, value: unknown) => sum + countNodes(value), 0);
  };

  const loadExample = (example: { code: string }) => {
    setCode(example.code);
    if (autoparse) {
      setTimeout(handleParse, 100);
    }
  };

  const loadPreset = (preset: { grammar: string }) => {
    setGrammar(preset.grammar);
    if (autoparse) {
      setTimeout(handleParse, 100);
    }
  };

  const loadLuminaPreset = (index: number) => {
    const preset = luminaPresets[index];
    if (!preset) return;
    setLuminaPreset(index);
    setLuminaCode(preset.code);
    setLuminaDiagnostics([]);
    setLuminaOutput('');
    setLuminaAst(null);
    setLuminaStatus('idle');
  };

  const exportData = () => {
    const data: SessionData = { grammar, code, output, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parser-session.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string) as SessionData;
          if (data.grammar) setGrammar(data.grammar);
          if (data.code) setCode(data.code);
          if (data.output) setOutput(data.output);
        } catch (error: unknown) {
          console.error('Error importing data:', error);
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    }
  };

  const getStatusIcon = () => {
    switch (parseStatus) {
      case 'success': return <CheckCircle className="text-green-400" size={16} />;
      case 'error': return <XCircle className="text-red-400" size={16} />;
      case 'parsing': return <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />;
      default: return <AlertCircle className="text-gray-400" size={16} />;
    }
  };

  const copyToClipboard = async (label: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied`);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyStatus(`${label} copied`);
    } finally {
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  useEffect(() => {
    if (autoparse) {
      const timer = setTimeout(handleParse, 500);
      return () => clearTimeout(timer);
    }
  }, [code, grammar, autoparse]);

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TreePine className="text-blue-400" />
            <div>
              <div className="text-lg font-semibold">Lumina Parser Studio</div>
              <div className="text-xs text-gray-400">Interactive demo for the parser + tooling pipeline</div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <button
              onClick={() => navigate('home')}
              className={`px-3 py-1.5 rounded text-sm ${route === 'home' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Home
            </button>
            <button
              onClick={() => navigate('playground')}
              className={`px-3 py-1.5 rounded text-sm ${route === 'playground' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Playground
            </button>
            <button
              onClick={() => navigate('lumina')}
              className={`px-3 py-1.5 rounded text-sm ${route === 'lumina' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Lumina
            </button>
          </nav>
        </div>
      </header>

      {route === 'home' && (
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
            <section className="grid gap-8 lg:grid-cols-2 items-center">
              <div className="space-y-4">
                <div className="text-xs uppercase tracking-[0.2em] text-blue-300">Lumina v0.3.x</div>
                <h1 className="text-4xl font-semibold leading-tight">Build grammars, compile apps, and ship cross-runtime tooling.</h1>
                <p className="text-gray-300 leading-relaxed">
                  Lumina now includes package management, traits, channels/threading primitives, WASM codegen, and a fuller stdlib.
                  This site is the fastest way to inspect parser internals and preview the language pipeline in-browser.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate('playground')}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
                  >
                    Open Playground
                  </button>
                  <button
                    onClick={() => navigate('lumina')}
                    className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm"
                  >
                    Lumina Overview
                  </button>
                </div>
              </div>
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2 text-sm text-blue-300">
                  <Zap size={14} /> Capability Snapshot
                </div>
                <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{`Lexer → Parser → HM/Semantic → IR/SSA → JS/WASM

Features:
- Package management + lockfile
- Tooling: fmt / lint / doc
- Concurrency: channel / thread / sync
- Runtime modules: fs, time, regex, crypto`}</pre>
                <div className="flex gap-2 text-xs text-gray-400">
                  <span className="px-2 py-1 bg-gray-900 rounded">PEG + Moo</span>
                  <span className="px-2 py-1 bg-gray-900 rounded">Lumina CLI</span>
                  <span className="px-2 py-1 bg-gray-900 rounded">LSP</span>
                  <span className="px-2 py-1 bg-gray-900 rounded">WASM</span>
                </div>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-4">
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-blue-300"><Code size={16} /> Grammar Studio</div>
                <p className="text-sm text-gray-300">Load PEG grammars, parse samples, inspect JSON output or AST trees.</p>
              </div>
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-blue-300"><TreePine size={16} /> Semantic Layer</div>
                <p className="text-sm text-gray-300">Track types, match exhaustiveness, DI, and SSA-ready IR.</p>
              </div>
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-blue-300"><FileText size={16} /> Tooling DX</div>
                <p className="text-sm text-gray-300">CLI pipeline, LSP diagnostics, rename/references, plus fmt/lint/doc tooling.</p>
              </div>
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-blue-300"><Zap size={16} /> Runtime + WASM</div>
                <p className="text-sm text-gray-300">Node + browser runtime modules with optional WASM backend for hot paths.</p>
              </div>
            </section>

            <section className="bg-gray-800/60 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center gap-2 text-blue-300 text-sm mb-3"><Play size={14} /> Try It Quickly</div>
              <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{`lumina repl
lumina compile examples/hello.lm --out dist/hello.js
lumina check examples/hello.lm
lumina fmt "examples/**/*.lm" --check
lumina lint "examples/**/*.lm"
lumina doc "examples/**/*.lm" --out docs/API.md
npm run verify`}</pre>
            </section>

            <section className="bg-gray-800/60 border border-gray-700 rounded-lg p-6 space-y-3">
              <div className="text-sm text-blue-300">Docs + References</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-700" href="https://github.com/nyigoro/lumina-lang/blob/main/docs/STDLIB.md" target="_blank" rel="noreferrer">Stdlib</a>
                <a className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-700" href="https://github.com/nyigoro/lumina-lang/blob/main/docs/CAPABILITIES.md" target="_blank" rel="noreferrer">Capabilities</a>
                <a className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-700" href="https://github.com/nyigoro/lumina-lang/blob/main/docs/PACKAGE_USAGE.md" target="_blank" rel="noreferrer">Packages</a>
                <a className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-700" href="https://github.com/nyigoro/lumina-lang/blob/main/README.md" target="_blank" rel="noreferrer">README</a>
              </div>
            </section>
          </div>
        </main>
      )}

      {route === 'lumina' && (
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
            <section className="space-y-4">
              <div className="text-xs uppercase tracking-[0.2em] text-blue-300">Lumina Toolchain</div>
              <h2 className="text-3xl font-semibold">Language, runtime, and tooling status</h2>
              <p className="text-gray-300">Current focus: production CLI flow (`verify`), expanded stdlib modules, and cross-runtime concurrency APIs.</p>
            </section>

            <section className="grid gap-6 md:grid-cols-3">
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-3">
                <div className="text-sm text-blue-300 flex items-center gap-2"><Zap size={14} /> Compiler Pipeline</div>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li>Lexer + PEG parser with panic-mode recovery</li>
                  <li>HM inference, traits, and diagnostics codes</li>
                  <li>IR optimization + AST codegen paths</li>
                  <li>JS and WASM backend targets</li>
                </ul>
              </div>
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-3">
                <div className="text-sm text-blue-300 flex items-center gap-2"><Info size={14} /> IDE + LSP</div>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li>Diagnostics with code-level reporting</li>
                  <li>Go-to-definition and references</li>
                  <li>Cross-file package symbol resolution</li>
                  <li>Semantic tokens + completion + hover</li>
                </ul>
              </div>
              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-5 space-y-3">
                <div className="text-sm text-blue-300 flex items-center gap-2"><FileText size={14} /> Tooling</div>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li><code>lumina fmt</code> for normalization/check mode</li>
                  <li><code>lumina lint</code> for semantic + style checks</li>
                  <li><code>lumina doc</code> for markdown API generation</li>
                  <li><code>npm run verify</code> as release safety gate</li>
                </ul>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-5">
                <div className="text-sm text-blue-300 mb-3">CLI</div>
                <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{`lumina compile src/main.lm --out dist/main.js
lumina compile src/main.lm --sourcemap --debug-ir
lumina check src/main.lm
lumina watch examples
lumina fmt "src/**/*.lm" --check
lumina lint "src/**/*.lm"
lumina doc "src/**/*.lm" --out docs/API.md`}</pre>
              </div>
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-5">
                <div className="text-sm text-blue-300 mb-3">Release Signals</div>
                <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{`Version: lumina-lang@0.3.x
Latest verify: lint:check + build + test
WASM benchmark: ~100x on recursive hot path
Runtime modules: io/str/math/list/vec/hashmap/hashset
Expanded modules: fs/time/regex/crypto/channel/thread/sync`}</pre>
                <div className="mt-4 text-xs text-gray-300">Project flow:</div>
                <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{`ProjectContext
  ├─ std/prelude.lm
  ├─ user sources
  ├─ dependency graph
  └─ diagnostics + IR`}</pre>
              </div>
            </section>

            <section className="bg-gray-800/60 border border-gray-700 rounded-lg p-5 space-y-3">
              <div className="text-sm text-blue-300">Runtime Compatibility Matrix</div>
              <div className="overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="py-2 pr-4">Feature</th>
                      <th className="py-2 pr-4">Browser</th>
                      <th className="py-2 pr-4">Node</th>
                      <th className="py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runtimeMatrix.map((row) => (
                      <tr key={row.feature} className="border-b border-gray-800">
                        <td className="py-2 pr-4 text-gray-200">{row.feature}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block px-2 py-0.5 rounded border ${supportBadgeClasses[row.browser]}`}>
                            {row.browser}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block px-2 py-0.5 rounded border ${supportBadgeClasses[row.node]}`}>
                            {row.node}
                          </span>
                        </td>
                        <td className="py-2 text-gray-400">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-gray-800/70 border border-gray-700 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-blue-300 flex items-center gap-2"><Zap size={14} /> Lumina Playground</div>
                  <div className="text-xs text-gray-400">Runs Lumina parse + semantic analysis in-browser (no runtime execution).</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard('CLI snippet', `lumina lint src/main.lm\nlumina compile src/main.lm --out dist/main.js`)}
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-xs"
                  >
                    Copy CLI snippet
                  </button>
                  <button
                    onClick={handleLuminaParse}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
                  >
                    Analyze
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {luminaPresets.map((preset, index) => (
                  <button
                    key={preset.name}
                    onClick={() => loadLuminaPreset(index)}
                    className={`text-left rounded border px-3 py-2 ${
                      luminaPreset === index
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-gray-700 bg-gray-900/40 hover:bg-gray-900/70'
                    }`}
                  >
                    <div className="text-xs text-blue-300">{preset.name}</div>
                    <div className="text-[11px] text-gray-400">{preset.description}</div>
                  </button>
                ))}
              </div>

              <CodeMirror
                value={luminaCode}
                height="12rem"
                theme={oneDark}
                extensions={[javascript()]}
                onChange={(value) => setLuminaCode(value)}
                basicSetup={{ lineNumbers: true, foldGutter: false }}
                className="rounded overflow-hidden"
              />

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Status:</span>
                <span className={luminaStatus === 'ok' ? 'text-green-400' : luminaStatus === 'error' ? 'text-red-400' : 'text-gray-400'}>
                  {luminaStatus}
                </span>
              </div>

              <div className="flex bg-gray-900/60 border border-gray-700 rounded">
                <button
                  onClick={() => setLuminaTab('diagnostics')}
                  className={`px-4 py-2 text-sm ${luminaTab === 'diagnostics' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
                >
                  Diagnostics
                </button>
                <button
                  onClick={() => setLuminaTab('ast')}
                  className={`px-4 py-2 text-sm ${luminaTab === 'ast' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
                >
                  AST
                </button>
                <button
                  onClick={() => setLuminaTab('js')}
                  className={`px-4 py-2 text-sm ${luminaTab === 'js' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
                >
                  JS Output
                </button>
                <div className="ml-auto flex items-center gap-2 px-3">
                  {copyStatus && <span className="text-xs text-green-400">{copyStatus}</span>}
                  {luminaTab === 'diagnostics' && (
                    <button
                      onClick={() => copyToClipboard('Diagnostics', JSON.stringify(luminaDiagnostics, null, 2))}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded flex items-center gap-1"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  )}
                  {luminaTab === 'ast' && (
                    <button
                      onClick={() => copyToClipboard('AST', luminaAst ? JSON.stringify(luminaAst, null, 2) : '')}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded flex items-center gap-1"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  )}
                  {luminaTab === 'js' && (
                    <button
                      onClick={() => copyToClipboard('JS output', luminaOutput)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded flex items-center gap-1"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-gray-900/60 border border-gray-700 rounded p-4">
                {luminaTab === 'diagnostics' && (
                  <div className="space-y-2 text-sm">
                    {luminaDiagnostics.length === 0 && <div className="text-gray-400">No diagnostics yet.</div>}
                    {luminaDiagnostics.map((diag, idx) => (
                      <div key={idx} className="border border-gray-700 rounded p-3">
                        <div className="text-xs uppercase text-gray-400 flex items-center gap-2">
                          <span>{diag.severity}</span>
                          {diag.code && <span className="text-blue-300">[{diag.code}]</span>}
                        </div>
                        <div className="text-sm">{diag.message}</div>
                        {diag.location && (
                          <div className="text-xs text-gray-400 mt-1">
                            {diag.location.start.line}:{diag.location.start.column}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {luminaTab === 'ast' && (
                  <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{luminaAst ? JSON.stringify(luminaAst, null, 2) : 'No AST yet.'}</pre>
                )}
                {luminaTab === 'js' && (
                  <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{luminaOutput || 'No JS output yet.'}</pre>
                )}
              </div>
            </section>
          </div>
        </main>
      )}

      {route === 'playground' && (
        <main className="flex-1 flex">
          <div className="w-80 bg-gray-800 flex flex-col border-r border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <TreePine className="text-blue-400" />
                Parser Studio
              </h1>
            </div>

            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setSidebarTab('examples')}
                className={`flex-1 px-4 py-2 text-sm flex items-center gap-2 ${sidebarTab === 'examples' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
              >
                <Play size={14} /> Examples
              </button>
              <button
                onClick={() => setSidebarTab('presets')}
                className={`flex-1 px-4 py-2 text-sm flex items-center gap-2 ${sidebarTab === 'presets' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
              >
                <FileText size={14} /> Grammars
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {sidebarTab === 'examples' && (
                <div className="space-y-2">
                  {examples.map((example, i) => (
                    <div key={i} className="bg-gray-700 rounded p-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => loadExample(example)}>
                      <div className="font-medium text-sm">{example.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{example.description}</div>
                      <div className="text-xs text-blue-300 mt-1 font-mono">{example.code}</div>
                    </div>
                  ))}
                </div>
              )}

              {sidebarTab === 'presets' && (
                <div className="space-y-2">
                  {presets.map((preset, i) => (
                    <div key={i} className="bg-gray-700 rounded p-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => loadPreset(preset)}>
                      <div className="font-medium text-sm">{preset.name}</div>
                      <div className="text-xs text-gray-400 mt-1 font-mono overflow-hidden">{preset.grammar.substring(0, 60)}...</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoparse}
                  onChange={(e) => setAutoparse(e.target.checked)}
                  className="rounded"
                />
                <label className="text-sm">Auto-parse</label>
              </div>

              <div className="flex gap-2">
                <button onClick={exportData} className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm flex items-center gap-1">
                  <Download size={12} /> Export
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm flex items-center gap-1">
                  <Upload size={12} /> Import
                </button>
              </div>

              <input ref={fileInputRef} type="file" accept=".json" onChange={importData} className="hidden" />
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowGrammar(!showGrammar)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm flex items-center gap-2"
                >
                  <Code size={14} /> {showGrammar ? 'Hide' : 'Show'} Grammar
                </button>

                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="text-sm capitalize">{parseStatus}</span>
                  {performance && (
                    <span className="text-xs text-gray-400">
                      ({performance.time.toFixed(1)}ms, {performance.nodes} nodes)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">History</span>
                  <PerformanceSparkline data={parseHistory} />
                </div>
              </div>

              <button
                onClick={handleParse}
                disabled={parseStatus === 'parsing'}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded flex items-center gap-2 transition-colors"
              >
                <Zap size={14} /> Parse
              </button>
            </div>

            {showGrammar && (
              <div className="bg-gray-800 border-b border-gray-700 p-4">
                <CodeMirror
                  value={grammar}
                  height="8rem"
                  theme={oneDark}
                  extensions={[pegLanguage]}
                  onChange={(value) => setGrammar(value)}
                  basicSetup={{ lineNumbers: true, foldGutter: false }}
                  className="rounded overflow-hidden"
                />
                {grammarError && (
                  <div className="mt-3 text-sm text-red-300 bg-red-900/30 border border-red-700 rounded p-2">
                    Grammar error: {grammarError}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 flex">
              <div className="flex-1 flex flex-col">
                <div className="bg-gray-800 p-4">
                  <CodeMirror
                    value={code}
                    height="10rem"
                    theme={oneDark}
                    extensions={[javascript()]}
                    onChange={(value) => setCode(value)}
                    basicSetup={{ lineNumbers: true, foldGutter: false }}
                    className="rounded overflow-hidden"
                  />
                </div>

                <div className="flex bg-gray-800 border-t border-gray-700">
                  <button
                    onClick={() => setActiveTab('output')}
                    className={`px-6 py-3 text-sm flex items-center gap-2 ${activeTab === 'output' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
                  >
                    <FileText size={14} /> JSON Output
                  </button>
                  <button
                    onClick={() => setActiveTab('ast')}
                    className={`px-6 py-3 text-sm flex items-center gap-2 ${activeTab === 'ast' ? 'bg-gray-700 border-b-2 border-blue-500' : ''}`}
                  >
                    <TreePine size={14} /> AST Tree
                  </button>
                  <div className="ml-auto flex items-center gap-2 px-3">
                    {copyStatus && <span className="text-xs text-green-400">{copyStatus}</span>}
                    {activeTab === 'output' && (
                      <button
                        onClick={() => copyToClipboard('Output', output)}
                        className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    )}
                    {activeTab === 'ast' && (
                      <button
                        onClick={() => copyToClipboard('AST tree', ast ? JSON.stringify(ast, null, 2) : '')}
                        className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 bg-gray-700 overflow-auto">
                  {activeTab === 'output' && (
                    <pre className="p-4 text-sm font-mono h-full overflow-auto whitespace-pre-wrap">{output || 'No output yet - click Parse to generate'}</pre>
                  )}
                  {activeTab === 'ast' && (
                    <TreeVisualization
                      data={ast}
                      onNodeClick={(node, path) => setSelectedNode({ node, path })}
                    />
                  )}
                </div>
              </div>

              {selectedNode && (
                <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
                  <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Info size={14} /> Node Inspector
                    </h3>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-gray-400 hover:text-white"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Name</label>
                        <div className="font-mono text-sm">{selectedNode.node.name}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Type</label>
                        <div className="font-mono text-sm">{selectedNode.node.type || 'unknown'}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Path</label>
                        <div className="font-mono text-sm text-blue-300">{selectedNode.path}</div>
                      </div>
                      {selectedNode.node.children && (
                        <div>
                          <label className="text-xs text-gray-400 uppercase tracking-wide">Children</label>
                          <div className="font-mono text-sm">{selectedNode.node.children.length}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

import React, { useState, useEffect, useRef, FC } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, ChevronRight, Play, Download, Upload, Info, Code, Zap, FileText, TreePine, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { compileGrammar, parseInput, formatError, ParseError, ParseResult } from '../src/index';

const defaultGrammar = `Expression
  = left:Term operator:("+" / "-") right:Expression {
      return { type: 'Expression', operator, left, right };
    }
  / Term

Term
  = left:Factor operator:("*" / "/") right:Term {
      return { type: 'Expression', operator, left, right };
    }
  / Factor

Factor
  = "(" expr:Expression ")" { return expr; }
  / Number

Number
  = [0-9]+ {
      return { type: 'Number', value: parseInt(text(), 10) };
    }`;

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
          className={`flex items-center py-1 px-2 hover:bg-gray-600 rounded cursor-pointer transition-colors`}
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
    // Auto-expand first level
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

function App() {
  const [code, setCode] = useState('3 + 4 * (2 - 1)');
  const [grammar, setGrammar] = useState(defaultGrammar);
  const [output, setOutput] = useState('');
  const [ast, setAst] = useState<TreeNode | null>(null);
  const [activeTab, setActiveTab] = useState('output');
  const [sidebarTab, setSidebarTab] = useState('examples');
  const [parseStatus, setParseStatus] = useState('idle');
  const [selectedNode, setSelectedNode] = useState<{ node: TreeNode; path: string } | null>(null);
  const [autoparse, setAutoparse] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [performance, setPerformance] = useState<ParsePerformance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    const startTime = window.performance.now();
    setParseStatus('parsing');
    
    try {
      const parser = compileGrammar(grammar);
      const result: ParseResult<unknown> | ParseError = parseInput(parser, code);
      const endTime = window.performance.now();
      
      if ('result' in result) {
        const jsonOutput = JSON.stringify(result.result, null, 2);
        setOutput(jsonOutput);
        const tree = transformToTree(result.result);
        setAst(tree);
        setParseStatus('success');
        setPerformance({ time: endTime - startTime, nodes: countNodes(result.result) });
      } else {
        setOutput(formatError(result));
        setAst(null);
        setParseStatus('error');
        setPerformance({ time: endTime - startTime, nodes: 0 });
      }
    } catch (error) {
      if (error instanceof Error) {
        setOutput(`Error: ${error.message}`);
      } else {
        setOutput('Unknown error occurred');
      }
      setAst(null);
      setParseStatus('error');
      setPerformance({ time: window.performance.now() - startTime, nodes: 0 });
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
        } catch (error: unknown) { // Explicitly type error as unknown
          console.error("Error importing data:", error);
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

  useEffect(() => {
    if (autoparse) {
      const timer = setTimeout(handleParse, 500);
      return () => clearTimeout(timer);
    }
  }, [code, grammar, autoparse]);

  return (
    <div className="bg-gray-900 text-white min-h-screen flex">
      {/* Sidebar */}
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
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
          </div>
          
          <button 
            onClick={handleParse}
            disabled={parseStatus === 'parsing'}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded flex items-center gap-2 transition-colors"
          >
            <Zap size={14} /> Parse
          </button>
        </div>

        {/* Grammar Editor */}
        {showGrammar && (
          <div className="bg-gray-800 border-b border-gray-700 p-4">
            <textarea
              value={grammar}
              onChange={(e) => setGrammar(e.target.value)}
              className="w-full h-32 bg-gray-700 text-white p-3 rounded font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your PEG grammar here..."
            />
          </div>
        )}

        <div className="flex-1 flex">
          {/* Input/Output Area */}
          <div className="flex-1 flex flex-col">
            {/* Input */}
            <div className="bg-gray-800 p-4">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={6}
                className="w-full bg-gray-700 text-white p-3 rounded font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter code to parse..."
              />
            </div>

            {/* Output Tabs */}
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
            </div>

            {/* Output Content */}
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

          {/* Node Inspector */}
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
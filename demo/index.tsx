import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compileGrammar, parseInput, formatError } from '../src/index';
import mathGrammar from '../examples/math.peg?raw';

const parser = compileGrammar(mathGrammar);
function App() {
  const [code, setCode] = useState('3 + 4 * (2 - 1)');
  const [output, setOutput] = useState('');

  const handleParse = () => {
    const result = parseInput(parser, code);
    if ('result' in result) {
      setOutput(JSON.stringify(result.result, null, 2));
    } else {
      setOutput(formatError(result));
    }
  };

  return (
    <div className="p-4 font-mono">
      <h1 className="text-xl font-bold mb-2">Parser Playground</h1>
      <textarea
        rows={5}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full border p-2 mb-4"
      />
      <button onClick={handleParse} className="bg-blue-600 text-white px-4 py-2 rounded">
        Parse
      </button>
      <pre className="mt-4 bg-gray-100 p-2 rounded">{output}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

import { type IRNode } from './ir.js';

type DotNode = {
  id: string;
  label: string;
};

type DotEdge = {
  from: string;
  to: string;
  label?: string;
};

function escapeLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function irToDot(ir: IRNode): string {
  let idCounter = 0;
  const nodes: DotNode[] = [];
  const edges: DotEdge[] = [];

  const makeId = () => `n${idCounter++}`;
  const addNode = (label: string): string => {
    const id = makeId();
    nodes.push({ id, label });
    return id;
  };

  const addEdge = (from: string, to: string, label?: string) => {
    edges.push({ from, to, label });
  };

  const walk = (node: IRNode, parentId?: string, edgeLabel?: string): string => {
    let label: string = node.kind;
    switch (node.kind) {
      case 'Function':
        label = `Function ${node.name}`;
        break;
      case 'Let':
        label = `Let ${node.name}`;
        break;
      case 'Phi':
        label = `Phi ${node.name}`;
        break;
      case 'Assign':
        label = `Assign ${node.target}`;
        break;
      case 'Call':
        label = `Call ${node.callee}`;
        break;
      case 'Binary':
        label = `Binary ${node.op}`;
        break;
      case 'Member':
        label = `Member .${node.property}`;
        break;
      case 'Index':
        label = `Index [${node.index}]`;
        break;
      case 'Enum':
        label = `Enum ${node.tag}`;
        break;
      case 'MatchExpr':
        label = 'MatchExpr';
        break;
      case 'Number':
        label = `Number ${formatValue(node.value)}`;
        break;
      case 'String':
        label = `String ${formatValue(node.value)}`;
        break;
      case 'Boolean':
        label = `Boolean ${formatValue(node.value)}`;
        break;
      case 'Identifier':
        label = `Identifier ${node.name}`;
        break;
      default:
        break;
    }

    const currentId = addNode(label);
    if (parentId) addEdge(parentId, currentId, edgeLabel);

    switch (node.kind) {
      case 'Program':
        node.body.forEach((child, idx) => walk(child, currentId, `stmt${idx}`));
        break;
      case 'Function':
        node.body.forEach((child, idx) => walk(child, currentId, `stmt${idx}`));
        break;
      case 'Let':
        walk(node.value, currentId, 'value');
        break;
      case 'Phi':
        walk(node.condition, currentId, 'cond');
        walk(node.thenValue, currentId, 'then');
        walk(node.elseValue, currentId, 'else');
        break;
      case 'Assign':
        walk(node.value, currentId, 'value');
        break;
      case 'Return':
        walk(node.value, currentId, 'value');
        break;
      case 'ExprStmt':
        walk(node.expr, currentId, 'expr');
        break;
      case 'Binary':
        walk(node.left, currentId, 'left');
        walk(node.right, currentId, 'right');
        break;
      case 'Member':
        walk(node.object, currentId, 'object');
        break;
      case 'Index':
        walk(node.target, currentId, 'target');
        break;
      case 'Call':
        node.args.forEach((arg, idx) => walk(arg, currentId, `arg${idx}`));
        break;
      case 'Enum':
        node.values.forEach((value, idx) => walk(value, currentId, `value${idx}`));
        break;
      case 'MatchExpr':
        walk(node.value, currentId, 'value');
        node.arms.forEach((arm, idx) => walk(arm.body, currentId, `arm${idx}`));
        break;
      case 'If':
        walk(node.condition, currentId, 'cond');
        node.thenBody.forEach((child, idx) => walk(child, currentId, `then${idx}`));
        node.elseBody?.forEach((child, idx) => walk(child, currentId, `else${idx}`));
        break;
      case 'While':
        walk(node.condition, currentId, 'cond');
        node.body.forEach((child, idx) => walk(child, currentId, `stmt${idx}`));
        break;
      case 'Number':
      case 'String':
      case 'Boolean':
      case 'Identifier':
      case 'Noop':
        break;
      default:
        break;
    }

    return currentId;
  };

  walk(ir);

  const lines: string[] = [];
  lines.push('digraph LuminaIR {');
  lines.push('  rankdir=LR;');
  for (const node of nodes) {
    lines.push(`  ${node.id} [label="${escapeLabel(node.label)}"];`);
  }
  for (const edge of edges) {
    const label = edge.label ? ` [label="${escapeLabel(edge.label)}"]` : '';
    lines.push(`  ${edge.from} -> ${edge.to}${label};`);
  }
  lines.push('}');
  return lines.join('\n');
}

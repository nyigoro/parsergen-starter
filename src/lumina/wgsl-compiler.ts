export type ShaderStage = 'compute' | 'vertex' | 'fragment';

export interface ShaderParam {
  name: string;
  type: string;
  attribute?: { kind: 'builtin' | 'location'; value: string };
}

export interface ShaderDecl {
  stage: ShaderStage;
  name: string;
  params: ShaderParam[];
  body: string;
  workgroupSize?: [number, number, number];
  returnType?: string;
  returnAttribute?: { kind: 'builtin' | 'location'; value: string };
}

export interface WgslCompileResult {
  ok: boolean;
  wgsl?: string;
  diagnostics: string[];
  ast?: ShaderDecl;
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const splitTopLevelComma = (value: string): string[] => {
  const parts: string[] = [];
  let current = '';
  let depthAngle = 0;
  let depthParen = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '<') depthAngle += 1;
    if (ch === '>') depthAngle = Math.max(0, depthAngle - 1);
    if (ch === '(') depthParen += 1;
    if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    if (ch === ',' && depthAngle === 0 && depthParen === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
};

const parseAttribute = (raw: string): { kind: 'builtin' | 'location'; value: string } | null => {
  const attr = raw.trim();
  if (!attr) return null;
  const builtin = attr.match(/^@builtin\((.+)\)$/);
  if (builtin) return { kind: 'builtin', value: builtin[1].trim() };
  const location = attr.match(/^@location\((.+)\)$/);
  if (location) return { kind: 'location', value: location[1].trim() };
  return null;
};

const parseWorkgroupSize = (raw: string): [number, number, number] | null => {
  const match = raw.match(/^@workgroup_size\(([^)]+)\)$/);
  if (!match) return null;
  const pieces = splitTopLevelComma(match[1]).map((piece) => Number(piece.trim()));
  if (pieces.some((piece) => !Number.isFinite(piece) || piece <= 0)) return null;
  if (pieces.length === 1) return [Math.trunc(pieces[0]), 1, 1];
  if (pieces.length === 2) return [Math.trunc(pieces[0]), Math.trunc(pieces[1]), 1];
  if (pieces.length >= 3) return [Math.trunc(pieces[0]), Math.trunc(pieces[1]), Math.trunc(pieces[2])];
  return null;
};

const isSupportedScalarType = (typeName: string): boolean => {
  return ['u32', 'i32', 'f32', 'bool'].includes(typeName);
};

const isSupportedVectorType = (typeName: string): boolean => {
  return /^vec[234]<(?:u32|i32|f32|bool)>$/.test(typeName);
};

const isSupportedMatrixType = (typeName: string): boolean => {
  return /^mat[234]x[234]<f32>$/.test(typeName);
};

const isSupportedArrayType = (typeName: string): boolean => {
  const match = typeName.match(/^array<(.+),\s*([A-Za-z_][A-Za-z0-9_]*|\d+)>$/);
  if (!match) return false;
  return isSupportedShaderType(match[1].trim());
};

const isSupportedShaderType = (typeName: string): boolean => {
  const trimmed = typeName.trim();
  return (
    isSupportedScalarType(trimmed) ||
    isSupportedVectorType(trimmed) ||
    isSupportedMatrixType(trimmed) ||
    isSupportedArrayType(trimmed)
  );
};

const findBodyBounds = (source: string, startIndex: number): { start: number; end: number } | null => {
  const open = source.indexOf('{', startIndex);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: open, end: i };
    }
  }
  return null;
};

const findMatchingParen = (source: string, openIndex: number): number => {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

export function parseShaderDsl(source: string): WgslCompileResult {
  const diagnostics: string[] = [];
  const headerPrefix = source.match(/^\s*shader\s+(compute|vertex|fragment)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!headerPrefix) {
    return { ok: false, diagnostics: ['Expected shader declaration: shader <stage> <name>(...) { ... }'] };
  }
  const stage = headerPrefix[1] as ShaderStage;
  const name = headerPrefix[2];
  const openParenIndex = headerPrefix[0].lastIndexOf('(');
  const closeParenIndex = findMatchingParen(source, openParenIndex);
  if (closeParenIndex < 0) {
    return { ok: false, diagnostics: ['Shader parameter list is missing a closing parenthesis'] };
  }
  const paramsRaw = source.slice(openParenIndex + 1, closeParenIndex).trim();
  const tail = source.slice(closeParenIndex + 1).trimStart();

  if (!identifierPattern.test(name)) {
    diagnostics.push(`Invalid shader function name '${name}'`);
  }

  const returnMatch = tail.match(/^->\s*([^\s@]+)\s*(@[^\s{]+)?\s*/);
  let returnType: string | undefined;
  let returnAttribute: { kind: 'builtin' | 'location'; value: string } | undefined;
  let remainder = tail;
  if (returnMatch) {
    returnType = returnMatch[1].trim();
    if (!isSupportedShaderType(returnType)) {
      diagnostics.push(`Unsupported shader return type '${returnType}'`);
    }
    if (returnMatch[2]) {
      const parsedReturnAttr = parseAttribute(returnMatch[2]);
      if (parsedReturnAttr) {
        returnAttribute = parsedReturnAttr;
      } else {
        diagnostics.push(`Unsupported return attribute '${returnMatch[2]}'`);
      }
    }
    remainder = remainder.slice(returnMatch[0].length);
  }

  const workgroupMatch = remainder.match(/^@workgroup_size\([^)]+\)\s*/);
  let workgroupSize: [number, number, number] | undefined;
  if (workgroupMatch) {
    const parsed = parseWorkgroupSize(workgroupMatch[0].trim());
    if (!parsed) {
      diagnostics.push(`Invalid @workgroup_size attribute '${workgroupMatch[0].trim()}'`);
    } else {
      workgroupSize = parsed;
    }
    remainder = remainder.slice(workgroupMatch[0].length);
  }

  const bodyStart = source.length - remainder.length;
  const bodyBounds = findBodyBounds(source, bodyStart);
  if (!bodyBounds) {
    diagnostics.push('Shader declaration is missing a balanced body block');
    return { ok: false, diagnostics };
  }
  const body = source.slice(bodyBounds.start + 1, bodyBounds.end).trim();

  const params: ShaderParam[] = [];
  if (paramsRaw.length > 0) {
    for (const rawParam of splitTopLevelComma(paramsRaw)) {
      const paramMatch = rawParam.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\s@]+)\s*(.*)$/);
      if (!paramMatch) {
        diagnostics.push(`Invalid shader parameter '${rawParam}'`);
        continue;
      }
      const paramName = paramMatch[1];
      const paramType = paramMatch[2];
      const attrRaw = paramMatch[3].trim();
      if (!isSupportedShaderType(paramType)) {
        diagnostics.push(`Unsupported shader parameter type '${paramType}'`);
      }
      const parsedAttr = attrRaw ? parseAttribute(attrRaw) : null;
      if (attrRaw && !parsedAttr) {
        diagnostics.push(`Unsupported parameter attribute '${attrRaw}'`);
      }
      params.push({
        name: paramName,
        type: paramType,
        attribute: parsedAttr ?? undefined,
      });
    }
  }

  if (stage === 'compute' && !workgroupSize) {
    diagnostics.push('Compute shader requires @workgroup_size(...)');
  }
  if (stage === 'compute' && returnType) {
    diagnostics.push('Compute shader cannot declare a return type');
  }
  if ((stage === 'vertex' || stage === 'fragment') && !returnType) {
    diagnostics.push(`${stage} shader requires a return type`);
  }
  if (stage === 'vertex' && returnAttribute?.kind === 'location') {
    diagnostics.push('Vertex shader return attribute should use @builtin(position)');
  }
  if (stage === 'fragment' && returnAttribute?.kind === 'builtin') {
    const targetMatch = returnAttribute.value.match(/^target\((\d+)\)$/);
    if (targetMatch) {
      returnAttribute = { kind: 'location', value: targetMatch[1] };
    } else {
      diagnostics.push('Fragment shader return builtin must be target(<index>)');
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const ast: ShaderDecl = {
    stage,
    name,
    params,
    body,
    workgroupSize,
    returnType,
    returnAttribute,
  };
  return { ok: true, diagnostics: [], ast };
}

const emitParam = (param: ShaderParam): string => {
  if (!param.attribute) return `${param.name}: ${param.type}`;
  if (param.attribute.kind === 'builtin') return `@builtin(${param.attribute.value}) ${param.name}: ${param.type}`;
  return `@location(${param.attribute.value}) ${param.name}: ${param.type}`;
};

export function compileShaderDsl(source: string): WgslCompileResult {
  const trimmed = source.trim();
  if (!trimmed.startsWith('shader ')) {
    return { ok: true, diagnostics: [], wgsl: source };
  }

  const parsed = parseShaderDsl(source);
  if (!parsed.ok || !parsed.ast) return parsed;

  const decl = parsed.ast;
  const params = decl.params.map(emitParam).join(', ');
  const lines: string[] = [];

  if (decl.stage === 'compute') {
    const [x, y, z] = decl.workgroupSize ?? [1, 1, 1];
    lines.push(`@compute @workgroup_size(${x}, ${y}, ${z})`);
    lines.push(`fn ${decl.name}(${params}) {`);
    lines.push(decl.body);
    lines.push('}');
    return { ok: true, diagnostics: [], wgsl: lines.join('\n'), ast: decl };
  }

  lines.push(`@${decl.stage}`);
  let signature = `fn ${decl.name}(${params})`;
  if (decl.returnType) {
    if (decl.returnAttribute) {
      if (decl.returnAttribute.kind === 'builtin') {
        signature += ` -> @builtin(${decl.returnAttribute.value}) ${decl.returnType}`;
      } else {
        signature += ` -> @location(${decl.returnAttribute.value}) ${decl.returnType}`;
      }
    } else {
      signature += ` -> ${decl.returnType}`;
    }
  }
  lines.push(`${signature} {`);
  lines.push(decl.body);
  lines.push('}');
  return { ok: true, diagnostics: [], wgsl: lines.join('\n'), ast: decl };
}

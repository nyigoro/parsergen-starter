import { compileShaderDsl, parseShaderDsl } from '../src/lumina/wgsl-compiler.js';

describe('WGSL compiler', () => {
  test('compiles compute shader DSL to WGSL', () => {
    const source = `
shader compute main(id: vec3<u32> @builtin(global_invocation_id)) @workgroup_size(64) {
  let i = id.x;
}
`;

    const result = compileShaderDsl(source);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('@compute @workgroup_size(64, 1, 1)');
    expect(result.wgsl).toContain('fn main(@builtin(global_invocation_id) id: vec3<u32>)');
  });

  test('compiles vertex and fragment shader DSL', () => {
    const vertex = compileShaderDsl(`
shader vertex vs_main(pos: vec3<f32> @location(0)) -> vec4<f32> @builtin(position) {
  return vec4<f32>(pos.x, pos.y, pos.z, 1.0);
}
`);

    const fragment = compileShaderDsl(`
shader fragment fs_main(color: vec4<f32> @location(0)) -> vec4<f32> @builtin(target(0)) {
  return color;
}
`);

    expect(vertex.ok).toBe(true);
    expect(vertex.wgsl).toContain('@vertex');
    expect(vertex.wgsl).toContain('-> @builtin(position) vec4<f32>');

    expect(fragment.ok).toBe(true);
    expect(fragment.wgsl).toContain('@fragment');
    expect(fragment.wgsl).toContain('-> @location(0) vec4<f32>');
  });

  test('reports invalid builtin combinations', () => {
    const result = parseShaderDsl(`
shader vertex bad(pos: vec3<f32> @location(0)) -> vec4<f32> @location(0) {
  return vec4<f32>(pos.x, pos.y, pos.z, 1.0);
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.join('\n')).toContain('Vertex shader return attribute should use @builtin(position)');
  });

  test('reports unsupported shader types', () => {
    const result = parseShaderDsl(`
shader compute invalid(a: vec3<f16> @location(0)) @workgroup_size(1) {
  let x = a.x;
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.join('\n')).toContain("Unsupported shader parameter type 'vec3<f16>'");
  });

  test('passes through raw WGSL strings unchanged', () => {
    const raw = '@compute @workgroup_size(1) fn main() {}';
    const result = compileShaderDsl(raw);

    expect(result.ok).toBe(true);
    expect(result.wgsl).toBe(raw);
  });
});

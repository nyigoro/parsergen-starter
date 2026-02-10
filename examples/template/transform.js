
/**
 * Transforms the parsed AST.
 * @param {any} ast - The Abstract Syntax Tree parsed by the grammar.
 * @returns {any} The transformed AST.
 */
export default function transform(ast) {
  console.log('Applying AST transformation...');
  // Example: Modify the AST
  if (ast && ast.type === 'Greeting') {
    return { ...ast, transformed: true, message: 'AST transformed successfully!' };
  }
  return ast;
}

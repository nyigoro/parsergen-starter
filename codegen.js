
/**
 * Generates code from the (potentially transformed) AST.
 * @param {any} ast - The Abstract Syntax Tree (or transformed AST).
 * @returns {string} The generated code.
 */
export default function codegen(ast) {
  console.log('Generating code from AST...');
  if (ast && ast.type === 'Greeting' && ast.transformed) {
    return `console.log("Transformed greeting: ${ast.value} - ${ast.message}");`;
  } else if (ast && ast.type === 'Greeting') {
    return `console.log("Original greeting: ${ast.value}");`;
  }
  return `console.log("Could not generate code for unknown AST type.");`;
}

export function extractImports(source: string): string[] {
  const imports: string[] = [];
  const fromRegex = /import\s+[^;]*?\s+from\s+["']([^"']+)["']/g;
  const bareRegex = /import\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fromRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  while ((match = bareRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

import path from 'node:path';
import { URI } from 'vscode-uri';
import { type SymbolDefinition } from './module-graph.js';

function formatDefinitionLabel(definition: SymbolDefinition): string {
  if (definition.uri.startsWith('file://')) {
    const fsPath = URI.parse(definition.uri).fsPath;
    return `${path.basename(fsPath)}:${definition.location.start.line}`;
  }
  if (definition.uri.startsWith('virtual://')) {
    return `${definition.uri.replace('virtual://', '')}:${definition.location.start.line}`;
  }
  return `${definition.uri}:${definition.location.start.line}`;
}

export function formatHoverContents(label: string, definition?: SymbolDefinition | null): string {
  let contents = `\`\`\`lumina\n${label}\n\`\`\``;
  if (definition) {
    const sourceLabel = formatDefinitionLabel(definition);
    contents += `\n\nDefined in \`${sourceLabel}\``;
    if (definition.docComment) {
      contents += `\n\n${definition.docComment}`;
    }
  }
  return contents;
}

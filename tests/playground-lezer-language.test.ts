import fs from 'node:fs';
import path from 'node:path';
import { luminaLanguage, scanLuminaTokens } from '../playground/src/lumina-language';

describe('playground Lezer-backed Lumina language', () => {
  const source = `// leading comment
import { io } from "@std";

/* block comment */
type UserId = int

fn square(x: int) -> int {
  let answer = square_user(x);
  return io.println("value={answer}")
}

fn main() -> int {
  return User.value()
}
`;

  test('uses the Lezer language path instead of StreamLanguage', () => {
    const languageSource = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/lumina-language.ts'),
      'utf-8'
    );

    expect(languageSource).toContain("from '@lezer/common'");
    expect(languageSource).toContain('new Language');
    expect(languageSource).not.toContain('StreamLanguage');
    expect(languageSource).not.toContain('StringStream');
  });

  test('recognizes representative Lumina syntax categories', () => {
    const tokens = scanLuminaTokens(source).map((token) => ({
      kind: token.kind,
      text: source.slice(token.from, token.to),
    }));

    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'LineComment', text: '// leading comment' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'BlockComment', text: '/* block comment */' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'ModuleKeyword', text: 'import' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'TypeDefinition', text: 'UserId' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'ValueDefinition', text: 'square' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'TypeName', text: 'int' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'String', text: '"value={answer}"' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'CallName', text: 'square_user' }]));
    expect(tokens).toEqual(expect.arrayContaining([{ kind: 'PropertyName', text: 'value' }]));
  });

  test('builds a stable Lezer tree for the editor language', () => {
    const tree = luminaLanguage.parser.parse(source);
    const childNames: string[] = [];
    const cursor = tree.cursor();
    if (cursor.firstChild()) {
      do {
        childNames.push(cursor.name);
      } while (cursor.nextSibling());
    }

    expect(tree.topNode.name).toBe('Lumina');
    expect(tree.length).toBe(source.length);
    expect(childNames).toEqual(expect.arrayContaining(['LineComment', 'TypeDefinition', 'ValueDefinition']));
  });
});

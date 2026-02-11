export async function readFile(): Promise<string> {
  throw new Error('fs/promises is not available in the browser demo');
}

export async function stat(): Promise<never> {
  throw new Error('fs/promises is not available in the browser demo');
}

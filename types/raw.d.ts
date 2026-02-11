declare module '*.peg?raw' {
  const content: string;
  export default content;
}

declare module '*.lm?raw' {
  const content: string;
  export default content;
}

declare module 'vite-plugin-raw' {
  const plugin: () => import('vite').Plugin;
  export default plugin;
}

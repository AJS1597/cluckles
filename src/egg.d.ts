declare module '*.egg?raw' {
  const content: string;
  export default content;
}

declare module '*.egg' {
  const content: unknown;
  export default content;
}

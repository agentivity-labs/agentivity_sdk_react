// `import css from '../styles.css?raw'` gives the text of the file (Vite and the standalone build both understand the suffix).
declare module '*?raw' {
  const content: string;
  export default content;
}

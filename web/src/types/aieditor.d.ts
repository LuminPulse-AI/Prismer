/**
 * AiEditor type declarations
 *
 * Resolves TypeScript type-checking issues for aieditor CSS module imports
 */

declare module 'aieditor/dist/style.css' {
  const content: string;
  export default content;
}

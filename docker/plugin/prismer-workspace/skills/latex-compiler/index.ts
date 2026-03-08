/**
 * Re-export latex-compiler skill from top-level skills/ directory.
 *
 * The canonical source lives at /skills/latex-compiler/ for independent
 * packaging and reuse. This file re-exports it so the prismer-workspace
 * plugin can discover it alongside other built-in skills.
 */
export { latexCompilerSkill, default } from '../../../../skills/latex-compiler/index';

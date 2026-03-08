/**
 * Re-export formal-methods skill from top-level skills/ directory.
 *
 * The canonical source lives at /skills/formal-methods/ for independent
 * packaging and reuse. This file re-exports it so the prismer-workspace
 * plugin can discover it alongside other built-in skills.
 */
export { formalMethodsSkill, default } from '../../../../skills/formal-methods/index';

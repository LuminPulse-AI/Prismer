/**
 * Re-export arxiv-reader skill from top-level skills/ directory.
 *
 * The canonical source lives at /skills/arxiv-reader/ for independent
 * packaging and reuse. This file re-exports it so the prismer-workspace
 * plugin can discover it alongside other built-in skills.
 */
export { arxivReaderSkill, default } from '../../../../skills/arxiv-reader/index';

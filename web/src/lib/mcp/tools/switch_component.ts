import { z } from 'zod';
import type { ComponentType } from '@/lib/events/types';
import { DISABLED_COMPONENTS } from '@/types/workspace';
import { McpToolError, toolSuccess } from '../errors';
import { postWorkspaceDirective, type WorkspaceMcpToolContext } from './context';

export const COMPONENT_TYPES = [
  'pdf-reader',
  'latex-editor',
  'jupyter-notebook',
  'code-playground',
  'ai-editor',
  'ag-grid',
  'bento-gallery',
  'three-viewer',
] as const;

export const switchComponentInputSchema = {
  component: z.enum(COMPONENT_TYPES),
};

export async function switchComponentTool(
  context: WorkspaceMcpToolContext,
  input: { component: ComponentType }
) {
  const component = input.component;

  if (DISABLED_COMPONENTS.has(component)) {
    throw new McpToolError(
      'COMPONENT_DISABLED',
      `Component "${component}" is disabled. Disabled components: ${Array.from(DISABLED_COMPONENTS).join(', ')}`
    );
  }

  await postWorkspaceDirective(context, 'SWITCH_COMPONENT', { component });
  return toolSuccess({ ok: true, current: component });
}

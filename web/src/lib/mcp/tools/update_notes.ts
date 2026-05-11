import { z } from 'zod';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';
import { McpToolError, toolSuccess } from '../errors';
import { postWorkspaceDirective, type WorkspaceMcpToolContext } from './context';

const DEFAULT_MAX_NOTES_SIZE_KB = 1024;

export const updateNotesInputSchema = {
  content: z.string(),
};

export async function updateNotesTool(
  context: WorkspaceMcpToolContext,
  input: { content: string }
) {
  const maxBytes = getMaxNotesBytes();

  if (input.content.length === 0) {
    throw new McpToolError('EMPTY_CONTENT', 'content is required');
  }

  if (Buffer.byteLength(input.content, 'utf8') > maxBytes) {
    throw new McpToolError('TOO_LARGE', `content exceeds ${Math.floor(maxBytes / 1024)} KB`);
  }

  const result = await upsertWorkspaceNote({
    workspaceId: context.workspaceId,
    content: input.content,
  });

  await postWorkspaceDirective(context, 'UPDATE_NOTES', { content: input.content });

  return toolSuccess({
    ok: true,
    assetId: result.assetId,
    length: input.content.length,
  });
}

function getMaxNotesBytes(): number {
  const parsed = Number.parseInt(process.env.MCP_MAX_NOTES_SIZE_KB || '', 10);
  const kb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_NOTES_SIZE_KB;
  return kb * 1024;
}

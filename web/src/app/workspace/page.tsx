/**
 * Workspace Page
 *
 * Workspace entry page.
 * Redirects to the most recent workspace or creates an initial one.
 */

import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { workspaceService } from '@/lib/services/workspace.service';

export const dynamic = 'force-dynamic';

/**
 * Open-source workspace mode runs in single-user local mode.
 */
async function getCurrentUserId(): Promise<string> {
  let devUser = await prisma.user.findUnique({
    where: { id: 'dev-user' },
  });
  if (!devUser) {
    devUser = await prisma.user.create({
      data: {
        id: 'dev-user',
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        name: 'Dev User',
      },
    });
  }
  return devUser.id;
}

export default async function WorkspacePage() {
  const ownerId = await getCurrentUserId();
  const workspace = await workspaceService.getOrCreateDefault(ownerId);
  redirect(`/workspace/${workspace.id}`);
}

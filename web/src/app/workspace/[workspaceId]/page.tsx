/**
 * Workspace Page - Dynamic Route
 *
 * /workspace/[workspaceId]
 * Renders the workspace view for a specific workspace session.
 */

import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { workspaceService } from '@/lib/services/workspace.service';
import { WorkspaceView } from '../components';

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

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

export default async function WorkspaceIdPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const ownerId = await getCurrentUserId();
  const workspace = await workspaceService.getById(workspaceId, ownerId);

  if (!workspace) {
    redirect('/workspace');
  }

  return (
    <WorkspaceView
      key={workspace.id}
      workspaceId={workspace.id}
      workspaceName={workspace.name}
    />
  );
}

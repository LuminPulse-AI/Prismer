/**
 * Workspace Components Exports
 *
 * @description
 * Unified export of all Workspace module components for convenient external imports.
 *
 * Component categories:
 * - Agent: Agent status and control components (Phase 1 core)
 * - Chat: Chat panel related components
 * - Task: Task panel components
 * - Window: Window viewer components
 * - Timeline: Timeline components
 * - Interactive: Interactive components
 * - Diff: Diff viewer components
 */

// Main layout
export { default as WorkspaceView } from './WorkspaceView';

// ============================================================
// Agent Components (Phase 1 - OpenClaw Integration)
// ============================================================
export { AgentStatusBadge } from './AgentStatusBadge';
export { AgentControlPanel } from './AgentControlPanel';
export { ConnectionIndicator } from './ConnectionIndicator';
export type { ConnectionStatus, ConnectionIndicatorProps } from './ConnectionIndicator';

// Chat Panel
export { WorkspaceChat } from './WorkspaceChat';
export { MessageList } from './WorkspaceChat/MessageList';
export { ChatInput } from './WorkspaceChat/ChatInput';

// Task Panel
export { TaskPanel } from './TaskPanel';

// Window Viewer
export { WindowViewer } from './WindowViewer';
export { ComponentTabs } from './WindowViewer/ComponentTabs';

// Timeline
export { Timeline } from './Timeline';

// Chat Toggle (SiriOrb + TaskBubble)
export { ChatToggle } from './ChatToggle';
export { TaskBubble } from './ChatToggle/TaskBubble';

// Interactive Components
export { InteractiveComponentRenderer } from './InteractiveComponents';
export { ButtonGroup } from './InteractiveComponents/ButtonGroup';
export { ChoiceCard } from './InteractiveComponents/ChoiceCard';
export { SummaryCard } from './InteractiveComponents/SummaryCard';
export { ProgressCard } from './InteractiveComponents/ProgressCard';
export { CodeBlock } from './InteractiveComponents/CodeBlock';

// Diff Viewer
export { DiffViewer, InlineDiffHighlight } from './DiffViewer';

// Re-export shared components for convenience
export { ActionCard } from '@/components/shared/ActionCard';

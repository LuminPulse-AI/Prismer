/**
 * Demo Flow Types
 * 
 * Demo flow data interface definitions.
 * All mock data is loaded through these interfaces to avoid hardcoding.
 */

import type {
  ExtendedChatMessage,
  ExtendedTimelineEvent,
  DemoFlowConfig,
  Participant,
  Task,
  UIDirective,
  ComponentType,
} from '../types';

// ============================================================
// Data Provider Interface
// ============================================================

/**
 * Demo data provider interface.
 * All mock data must implement this interface.
 */
export interface IDemoDataProvider {
  /** Get demo flow configuration */
  getDemoFlowConfig(): DemoFlowConfig;

  /** Get participant list */
  getParticipants(): Participant[];

  /** Get initial task list */
  getInitialTasks(): Task[];

  /** Get messages for a specific step */
  getStepMessages(stepIndex: number): ExtendedChatMessage[];

  /** Get timeline events for a specific step */
  getStepTimelineEvents(stepIndex: number): ExtendedTimelineEvent[];

  /** Handle interaction response */
  handleInteraction(componentId: string, actionId: string, data?: unknown): InteractionHandlerResult;
}

/**
 * Interaction handler result
 */
export interface InteractionHandlerResult {
  /** New messages to add */
  messages?: ExtendedChatMessage[];
  /** UI directives to execute */
  uiDirectives?: UIDirective[];
  /** Timeline events to add */
  timelineEvents?: ExtendedTimelineEvent[];
  /** Whether to trigger the next step */
  triggerNextStep?: boolean;
}

// ============================================================
// Agent Definitions
// ============================================================

/**
 * Agent definition
 */
export interface AgentDefinition {
  id: string;
  name: string;
  avatar?: string;
  role: 'research' | 'code' | 'writing' | 'analysis';
  description: string;
}

/**
 * Predefined Agent List
 */
export const DEMO_AGENTS: Record<string, AgentDefinition> = {
  'agent-research': {
    id: 'agent-research',
    name: 'Aria (Research)',
    role: 'research',
    description: 'Research assistant for paper search and analysis',
  },
  'agent-code': {
    id: 'agent-code',
    name: 'Copilot (Code)',
    role: 'code',
    description: 'Code assistant for writing and executing code',
  },
  'agent-writing': {
    id: 'agent-writing',
    name: 'Claude (Writing)',
    role: 'writing',
    description: 'Writing assistant for paper composition',
  },
  'agent-analysis': {
    id: 'agent-analysis',
    name: 'Nova (Analysis)',
    role: 'analysis',
    description: 'Analysis assistant for data analysis and visualization',
  },
};

// ============================================================
// Step Templates
// ============================================================

/**
 * Step template definition
 */
export interface StepTemplate {
  id: string;
  title: string;
  description: string;
  primaryAgent: string;
  targetComponent: ComponentType;
  expectedDuration: number;
}

/**
 * VLA Research Demo Step Templates
 */
export const VLA_DEMO_STEPS: StepTemplate[] = [
  {
    id: 'step-1-init',
    title: 'Agent Initiates',
    description: 'Research Agent detects new papers and asks user',
    primaryAgent: 'agent-research',
    targetComponent: 'ai-editor',
    expectedDuration: 3000,
  },
  {
    id: 'step-2-confirm',
    title: 'User Confirms',
    description: 'User confirms analysis request with benchmark requirements',
    primaryAgent: 'agent-research',
    targetComponent: 'ai-editor',
    expectedDuration: 2000,
  },
  {
    id: 'step-3-pdf',
    title: 'PDF Analysis',
    description: 'Load and analyze VLA-RAIL paper',
    primaryAgent: 'agent-research',
    targetComponent: 'pdf-reader',
    expectedDuration: 5000,
  },
  {
    id: 'step-4-code',
    title: 'Code Experiment',
    description: 'Dispatch Code Agent to write and run benchmark',
    primaryAgent: 'agent-code',
    targetComponent: 'code-playground',
    expectedDuration: 6000,
  },
  {
    id: 'step-5-viz',
    title: 'Jupyter Visualization',
    description: 'Generate performance comparison charts',
    primaryAgent: 'agent-code',
    targetComponent: 'jupyter-notebook',
    expectedDuration: 4000,
  },
  {
    id: 'step-6-summary',
    title: 'Experiment Summary',
    description: 'Summarize results and ask about paper writing',
    primaryAgent: 'agent-research',
    targetComponent: 'ai-editor',
    expectedDuration: 3000,
  },
  {
    id: 'step-7-notes',
    title: 'Reference Notes',
    description: 'User references previous study notes',
    primaryAgent: 'agent-writing',
    targetComponent: 'ai-editor',
    expectedDuration: 2000,
  },
  {
    id: 'step-8-latex',
    title: 'LaTeX Writing',
    description: 'Write experiment section and references to LaTeX',
    primaryAgent: 'agent-writing',
    targetComponent: 'latex-editor',
    expectedDuration: 8000,
  },
  {
    id: 'step-9-final',
    title: 'Final Report',
    description: 'Summarize all work output',
    primaryAgent: 'agent-research',
    targetComponent: 'ai-editor',
    expectedDuration: 3000,
  },
];

// ============================================================
// Utility Types
// ============================================================

/**
 * Generate a unique ID
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get the current timestamp as an ISO string
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

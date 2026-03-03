/**
 * Demo Orchestrator
 *
 * Plain module (not a hook) that intercepts specific user messages and
 * drives multi-step demo flows through Zustand stores + custom events.
 * Simulates real agent behavior when container LLM is unavailable.
 *
 * Usage:
 *   import { tryDemoMessage } from '../lib/demoOrchestrator';
 *   if (tryDemoMessage(workspaceId, content)) return;
 */

import { useChatStore } from '../stores/chatStore';
import { useTaskStore } from '../stores/taskStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useComponentStore } from '../stores/componentStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useAgentInstanceStore } from '../stores/agentInstanceStore';
import type { ExtendedChatMessage, ExtendedTimelineEvent, Task, ComponentType, TimelineActionType } from '../types';
import type { ArtifactRef } from '@/types/message';
import { componentEventBus } from '@/lib/events';
import { VIT_SURVEY_LATEX } from '../hooks/demo-content/vitSurvey';
import { COS_CURVE_CODE, COS_CURVE_SVG, COS_CURVE_SVG_RAW } from '../hooks/demo-content/cosCurve';
import { ABLATION_STUDY_HTML } from '../hooks/demo-content/ablationStudy';

// ============================================================
// Types
// ============================================================

interface OrchestratorContext {
  workspaceId: string;
  addMessage: (msg: ExtendedChatMessage) => void;
  setTasks: (tasks: Task[]) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateSubtaskStatus: (taskId: string, subtaskId: string, status: 'pending' | 'running' | 'completed' | 'error') => void;
  addTimelineEvent: (event: ExtendedTimelineEvent) => void;
  setActiveComponent: (type: ComponentType) => void;
  updateComponentState: <K extends keyof import('../types').ComponentStates>(
    component: K,
    state: Partial<import('../types').ComponentStates[K]>
  ) => void;
  setTaskPanelHeight: (height: import('../types').TaskPanelHeight) => void;
}

// ============================================================
// Helpers
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let messageCounter = 0;
function msgId(): string {
  return `demo-msg-${Date.now()}-${++messageCounter}`;
}

function agentMessage(
  workspaceId: string,
  content: string,
  artifacts?: ArtifactRef[],
): ExtendedChatMessage {
  return {
    id: msgId(),
    workspaceId,
    senderId: 'demo-agent',
    senderType: 'agent',
    senderName: 'Research Agent',
    content,
    contentType: 'markdown',
    timestamp: new Date().toISOString(),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
  };
}

function userMessage(workspaceId: string, content: string): ExtendedChatMessage {
  return {
    id: msgId(),
    workspaceId,
    senderId: 'dev-user-1',
    senderType: 'user',
    senderName: 'User',
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
  };
}

function tlEvent(
  componentType: ComponentType,
  action: TimelineActionType,
  description: string,
): ExtendedTimelineEvent {
  return {
    id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    componentType,
    action,
    description,
    actorType: 'agent',
  };
}

// ============================================================
// Scenario 1: ViT Survey (LaTeX)
// ============================================================

async function runViTSurveyScenario(ctx: OrchestratorContext): Promise<void> {
  const { workspaceId } = ctx;

  ctx.addMessage(agentMessage(workspaceId,
    'Sure, I will help you write a survey paper on **Vision Transformer**.\n\n' +
    'I will complete this in three phases:\n' +
    '1. Literature review and outline design\n' +
    '2. Draft writing\n' +
    '3. LaTeX compilation and typesetting\n\n' +
    'Starting the literature review...'
  ));

  await delay(500);
  const tasks: Task[] = [
    {
      id: 'task-vit-1', title: 'Literature Review & Outline', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-1-1', parentId: 'task-vit-1', title: 'Search ViT-related papers', status: 'pending' },
        { id: 'sub-1-2', parentId: 'task-vit-1', title: 'Analyze core architecture variants', status: 'pending' },
        { id: 'sub-1-3', parentId: 'task-vit-1', title: 'Design paper outline', status: 'pending' },
      ],
    },
    {
      id: 'task-vit-2', title: 'Write Draft', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-2-1', parentId: 'task-vit-2', title: 'Introduction & Background', status: 'pending' },
        { id: 'sub-2-2', parentId: 'task-vit-2', title: 'Architecture & Key Variants', status: 'pending' },
        { id: 'sub-2-3', parentId: 'task-vit-2', title: 'Performance Comparison', status: 'pending' },
        { id: 'sub-2-4', parentId: 'task-vit-2', title: 'Applications & Conclusion', status: 'pending' },
      ],
    },
    {
      id: 'task-vit-3', title: 'LaTeX Compilation & Typesetting', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-3-1', parentId: 'task-vit-3', title: 'Compile LaTeX source', status: 'pending' },
        { id: 'sub-3-2', parentId: 'task-vit-3', title: 'Generate PDF preview', status: 'pending' },
      ],
    },
  ];
  ctx.setTasks(tasks);
  ctx.setTaskPanelHeight('30%');

  // Task 1: Literature review
  await delay(500);
  ctx.updateTask('task-vit-1', { status: 'running' });
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_start', 'Starting literature review'));

  await delay(1000);
  ctx.updateSubtaskStatus('task-vit-1', 'sub-1-1', 'completed');
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_step', 'Retrieved 8 core papers'));

  await delay(800);
  ctx.updateSubtaskStatus('task-vit-1', 'sub-1-2', 'completed');

  await delay(600);
  ctx.updateSubtaskStatus('task-vit-1', 'sub-1-3', 'completed');
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_step', 'Outline design completed'));

  // Task 2: Write draft
  await delay(500);
  ctx.updateTask('task-vit-2', { status: 'running' });
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_step', 'Starting draft writing'));

  await delay(1000);
  ctx.setActiveComponent('latex-editor');

  // 2s for lazy component mount
  await delay(2000);
  window.dispatchEvent(new CustomEvent('demo:updateLatex', {
    detail: { file: 'main.tex', content: VIT_SURVEY_LATEX },
  }));

  // Artifact created notification (DESIGN §3.6 Scene A)
  ctx.addMessage(agentMessage(workspaceId,
    'LaTeX document created, writing chapters...', [
      {
        id: 'artifact-vit-tex',
        type: 'latex',
        name: 'vit-survey.tex',
        description: 'Vision Transformer survey paper LaTeX source',
        version: 'v1',
        size: '8.2 KB',
        previewText: '\\documentclass{article}\n\\title{Vision Transformer: A Comprehensive Survey}\n...',
      },
    ]));

  await delay(500);
  ctx.updateSubtaskStatus('task-vit-2', 'sub-2-1', 'completed');
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_step', 'Introduction writing completed'));

  await delay(500);
  ctx.updateSubtaskStatus('task-vit-2', 'sub-2-2', 'completed');

  await delay(500);
  ctx.updateSubtaskStatus('task-vit-2', 'sub-2-3', 'completed');
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_step', 'Performance comparison table completed'));

  await delay(500);
  ctx.updateSubtaskStatus('task-vit-2', 'sub-2-4', 'completed');
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_step', 'Draft writing completed'));

  // Task 3: Compilation (Docker-based, ~15s total)
  await delay(500);
  ctx.updateTask('task-vit-3', { status: 'running' });
  ctx.updateSubtaskStatus('task-vit-3', 'sub-3-1', 'running');
  ctx.addTimelineEvent(tlEvent('latex-editor', 'execute', 'Starting LaTeX compilation'));

  await delay(500);
  window.dispatchEvent(new CustomEvent('demo:compileLatex'));

  // Wait for compilation to complete via component event bus
  // LatexEditorPreview emits 'actionComplete' when compile finishes
  try {
    await componentEventBus.waitForAction('latex-editor', 'compile', 30000);
  } catch {
    // Timeout — compilation may still be in progress or failed, continue anyway
    console.warn('[DemoOrchestrator] LaTeX compile wait timed out');
  }
  await delay(500);

  ctx.updateSubtaskStatus('task-vit-3', 'sub-3-1', 'completed');
  ctx.updateSubtaskStatus('task-vit-3', 'sub-3-2', 'completed');
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_complete', 'LaTeX compilation completed'));

  await delay(500);
  ctx.addMessage(agentMessage(workspaceId,
    'Survey writing complete!\n\n' +
    '**Vision Transformer: A Comprehensive Survey** has been compiled in the LaTeX editor.\n\n' +
    'The paper includes:\n' +
    '- 6 chapters (Introduction to Conclusion)\n' +
    '- Self-attention mechanism mathematical formulas\n' +
    '- ViT variant performance comparison table\n' +
    '- 8 core references', [
      {
        id: 'artifact-vit-pdf',
        type: 'pdf',
        name: 'vit-survey.pdf',
        description: 'Compiled PDF document',
        version: 'v1',
        size: '245 KB',
      },
      {
        id: 'artifact-vit-tex-final',
        type: 'latex',
        name: 'vit-survey.tex',
        description: 'LaTeX source (6 chapters + references)',
        version: 'v1',
        size: '8.2 KB',
      },
    ]));
  ctx.addTimelineEvent(tlEvent('latex-editor', 'workflow_complete', 'Task completed: ViT survey'));
}

// ============================================================
// Scenario 2: Cos Curve (Jupyter + Gallery)
// ============================================================

async function runCosCurveScenario(ctx: OrchestratorContext): Promise<void> {
  const { workspaceId } = ctx;

  ctx.addMessage(agentMessage(workspaceId,
    'Sure, I will plot a cos curve using **Python**.\n\n' +
    'I will use NumPy + Matplotlib to generate a high-quality chart and save it to the asset library.'
  ));

  await delay(500);
  const tasks: Task[] = [
    {
      id: 'task-cos-1', title: 'Write plotting code', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-cos-1-1', parentId: 'task-cos-1', title: 'Generate data and plot', status: 'pending' },
        { id: 'sub-cos-1-2', parentId: 'task-cos-1', title: 'Execute code', status: 'pending' },
      ],
    },
    {
      id: 'task-cos-2', title: 'Save to asset library', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-cos-2-1', parentId: 'task-cos-2', title: 'Save image to Gallery', status: 'pending' },
      ],
    },
  ];
  ctx.setTasks(tasks);
  ctx.setTaskPanelHeight('30%');

  await delay(500);
  ctx.updateTask('task-cos-1', { status: 'running' });
  ctx.addTimelineEvent(tlEvent('jupyter-notebook', 'workflow_start', 'Starting cos curve plot'));

  await delay(500);
  ctx.setActiveComponent('jupyter-notebook');
  ctx.addTimelineEvent(tlEvent('jupyter-notebook', 'execute', 'Switched to Jupyter Notebook'));

  // 2s for lazy component mount
  await delay(2000);
  ctx.updateSubtaskStatus('task-cos-1', 'sub-cos-1-1', 'running');
  window.dispatchEvent(new CustomEvent('demo:addAndRunCell', {
    detail: {
      type: 'code',
      source: COS_CURVE_CODE,
      // Pre-rendered outputs: skip real kernel execution
      outputs: [
        {
          type: 'stream',
          name: 'stdout',
          text: 'Plot saved to /workspace/cos_curve.png\n',
        },
        {
          type: 'display_data',
          data: {
            'image/svg+xml': COS_CURVE_SVG_RAW,
            'text/plain': '<Figure size 1000x600 with 1 Axes>',
          },
          metadata: {},
        },
      ],
    },
  }));

  await delay(1500);
  ctx.updateSubtaskStatus('task-cos-1', 'sub-cos-1-1', 'completed');
  ctx.updateSubtaskStatus('task-cos-1', 'sub-cos-1-2', 'completed');
  ctx.addTimelineEvent(tlEvent('jupyter-notebook', 'workflow_step', 'Cos curve plotting code execution completed'));

  // Artifact: Jupyter notebook created
  ctx.addMessage(agentMessage(workspaceId,
    'Plotting code executed successfully, saving image to asset library...', [
      {
        id: 'artifact-cos-notebook',
        type: 'notebook',
        name: 'cos_curve.ipynb',
        description: 'Cos curve plotted with NumPy + Matplotlib',
        version: 'v1',
        size: '3.1 KB',
        previewText: 'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 4*np.pi, 1000)\ny = np.cos(x)',
      },
    ]));

  // Hold Jupyter visible for 4s so user can see code + SVG output
  await delay(4000);

  ctx.updateTask('task-cos-2', { status: 'running' });
  ctx.updateSubtaskStatus('task-cos-2', 'sub-cos-2-1', 'running');

  await delay(500);
  ctx.setActiveComponent('bento-gallery');
  ctx.addTimelineEvent(tlEvent('bento-gallery', 'navigate', 'Switched to Gallery'));

  // 2s for lazy component mount
  await delay(2000);
  window.dispatchEvent(new CustomEvent('demo:addGalleryImage', {
    detail: {
      image: {
        id: `cos-${Date.now()}`,
        title: 'Cosine Curve',
        desc: 'cos(x) plotted with NumPy + Matplotlib. Range: [0, 4π]',
        url: COS_CURVE_SVG,
        span: 'md:col-span-2 md:row-span-2',
      },
    },
  }));

  await delay(500);
  ctx.updateSubtaskStatus('task-cos-2', 'sub-cos-2-1', 'completed');
  ctx.addTimelineEvent(tlEvent('bento-gallery', 'workflow_complete', 'Image saved to Gallery'));

  await delay(1000);
  ctx.addMessage(agentMessage(workspaceId,
    'Cos curve plotted successfully!\n\n' +
    '- **Jupyter**: Plotting code executed\n' +
    '- **Gallery**: Cos curve chart added to gallery\n\n' +
    'The chart displays the complete waveform of cos(x) over the interval [0, 4pi].', [
      {
        id: 'artifact-cos-image',
        type: 'image',
        name: 'cos_curve.svg',
        description: 'cos(x) curve chart -- Range: [0, 4pi]',
        version: 'v1',
        size: '2.4 KB',
        previewUrl: COS_CURVE_SVG,
      },
    ]));
  ctx.addTimelineEvent(tlEvent('bento-gallery', 'workflow_complete', 'Task completed: cos curve plot'));
}

// ============================================================
// Scenario 3: Ablation Study (Notes)
// ============================================================

async function runAblationStudyScenario(ctx: OrchestratorContext): Promise<void> {
  const { workspaceId } = ctx;

  ctx.addMessage(agentMessage(workspaceId,
    'Sure, I will write an **object detection ablation study** analysis document.\n\n' +
    'I will perform systematic ablation analysis on Backbone, Neck, Head, data augmentation, and Loss based on the COCO 2017 dataset.'
  ));

  await delay(500);
  const tasks: Task[] = [
    {
      id: 'task-abl-1', title: 'Design experiment plan', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-abl-1-1', parentId: 'task-abl-1', title: 'Define ablation variables', status: 'pending' },
        { id: 'sub-abl-1-2', parentId: 'task-abl-1', title: 'Set up baseline model', status: 'pending' },
      ],
    },
    {
      id: 'task-abl-2', title: 'Write analysis report', status: 'pending', progress: 0,
      subtasks: [
        { id: 'sub-abl-2-1', parentId: 'task-abl-2', title: 'Generate experiment result tables', status: 'pending' },
        { id: 'sub-abl-2-2', parentId: 'task-abl-2', title: 'Write analysis and conclusions', status: 'pending' },
      ],
    },
  ];
  ctx.setTasks(tasks);
  ctx.setTaskPanelHeight('30%');

  await delay(500);
  ctx.updateTask('task-abl-1', { status: 'running' });
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_start', 'Starting experiment plan design'));

  await delay(800);
  ctx.updateSubtaskStatus('task-abl-1', 'sub-abl-1-1', 'completed');

  await delay(600);
  ctx.updateSubtaskStatus('task-abl-1', 'sub-abl-1-2', 'completed');
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_step', 'Experiment plan design completed'));

  await delay(600);
  ctx.updateTask('task-abl-2', { status: 'running' });
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_step', 'Starting analysis report writing'));

  await delay(500);
  ctx.setActiveComponent('ai-editor');

  // 2s for component mount
  await delay(2000);
  ctx.updateComponentState('ai-editor', { content: ABLATION_STUDY_HTML });
  ctx.addTimelineEvent(tlEvent('ai-editor', 'edit', 'Document content injected'));

  await delay(500);
  ctx.updateSubtaskStatus('task-abl-2', 'sub-abl-2-1', 'completed');
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_step', '6 ablation experiment tables completed'));

  await delay(800);
  ctx.updateSubtaskStatus('task-abl-2', 'sub-abl-2-2', 'completed');
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_complete', 'Analysis report writing completed'));

  // Artifact: Notes document created
  ctx.addMessage(agentMessage(workspaceId,
    'Document content generated, completing analysis section...', [
      {
        id: 'artifact-abl-notes',
        type: 'notes',
        name: 'ablation-study-report.md',
        description: 'Object detection ablation study -- COCO 2017',
        version: 'v1',
        size: '15.6 KB',
      },
    ]));

  await delay(700);
  ctx.addMessage(agentMessage(workspaceId,
    'Ablation study document complete!\n\n' +
    'The document includes:\n' +
    '- 6 ablation experiments (Backbone/Neck/Head/Augmentation/Loss/NMS)\n' +
    '- Detailed performance comparison tables (mAP, AP50, AP75, etc.)\n' +
    '- Best combination analysis: **Swin-S + BiFPN + CIoU + Combined Aug -> 48.7 mAP** (+11.3)\n' +
    '- Quantitative analysis and conclusions for each experiment', [
      {
        id: 'artifact-abl-notes-final',
        type: 'notes',
        name: 'ablation-study-report.md',
        description: 'Full report -- 6 experiments + conclusion analysis',
        version: 'v2',
        size: '15.6 KB',
      },
    ]));
  ctx.addTimelineEvent(tlEvent('ai-editor', 'workflow_complete', 'Task completed: ablation study document'));
}

// ============================================================
// Pattern Matching
// ============================================================

type ScenarioId = 'vit-survey' | 'cos-curve' | 'ablation-study';

function matchScenario(content: string): ScenarioId | null {
  const lower = content.toLowerCase();

  if (
    (lower.includes('vision transformer') || lower.includes('vit')) &&
    (lower.includes('survey'))
  ) return 'vit-survey';

  if (lower.includes('cos') && (lower.includes('curve') || lower.includes('plot')))
    return 'cos-curve';

  if (lower.includes('ablation') && (lower.includes('study') || lower.includes('experiment') || lower.includes('document'))) return 'ablation-study';
  if (lower.includes('ablation') && lower.includes('study')) return 'ablation-study';

  return null;
}

const scenarioRunners: Record<ScenarioId, (ctx: OrchestratorContext) => Promise<void>> = {
  'vit-survey': runViTSurveyScenario,
  'cos-curve': runCosCurveScenario,
  'ablation-study': runAblationStudyScenario,
};

// ============================================================
// Public API
// ============================================================

let isRunning = false;

function buildContext(workspaceId: string): OrchestratorContext {
  return {
    workspaceId,
    addMessage: (msg) => useChatStore.getState().addMessage(msg),
    setTasks: (tasks) => useTaskStore.getState().setTasks(tasks),
    updateTask: (id, updates) => useTaskStore.getState().updateTask(id, updates),
    updateSubtaskStatus: (taskId, subtaskId, status) =>
      useTaskStore.getState().updateSubtaskStatus(taskId, subtaskId, status),
    addTimelineEvent: (event) => useTimelineStore.getState().addTimelineEvent(event),
    setActiveComponent: (type) => useComponentStore.getState().setActiveComponent(type),
    updateComponentState: (component, state) =>
      useComponentStore.getState().updateComponentState(component, state as never),
    setTaskPanelHeight: (height) => useLayoutStore.getState().setTaskPanelHeight(height),
  };
}

/**
 * Try to handle a message as a demo scenario.
 * Returns true if matched (message consumed), false if not (pass to real bridge).
 */
export function tryDemoMessage(workspaceId: string, content: string): boolean {
  const scenario = matchScenario(content);
  if (!scenario) return false;

  if (isRunning) {
    useChatStore.getState().addMessage(
      agentMessage(workspaceId, 'A task is currently running, please try again later.')
    );
    return true;
  }

  // Add user message
  useChatStore.getState().addMessage(userMessage(workspaceId, content));

  // Activate demo mode — sets connection indicator to green
  useAgentInstanceStore.setState({
    agentInstanceStatus: 'running',
    agentInstanceId: useAgentInstanceStore.getState().agentInstanceId || 'demo-agent-instance',
    gatewayUrl: 'ws://demo-orchestrator:18900',
    orchestratorType: 'docker',
    containerHostPort: 18900,
  });

  // Run scenario
  isRunning = true;
  const ctx = buildContext(workspaceId);
  scenarioRunners[scenario](ctx)
    .catch((err) => {
      console.error('[DemoOrchestrator] Scenario error:', err);
      ctx.addMessage(agentMessage(workspaceId, `Scenario execution error: ${err instanceof Error ? err.message : String(err)}`));
    })
    .finally(() => { isRunning = false; });

  return true;
}

/**
 * VLA Research Demo Data
 *
 * Complete VLA model research demo data.
 * Data is provided through the IDemoDataProvider interface.
 */

import type {
  DemoFlowConfig,
  DemoStep,
  ExtendedChatMessage,
  ExtendedTimelineEvent,
  Participant,
  Task,
  InteractiveComponent,
  UIDirective,
  AgentAction,
  StateSnapshot,
} from '@/app/workspace/types';
import type { IDemoDataProvider, InteractionHandlerResult } from '@/app/workspace/mock/demoFlowTypes';
import { DEMO_AGENTS, VLA_DEMO_STEPS, generateId, getTimestamp } from '@/app/workspace/mock/demoFlowTypes';

// ============================================================
// Constants
// ============================================================

const WORKSPACE_ID = 'workspace-vla-research';
const USER_ID = 'user-1';
const USER_NAME = 'Me';

// Base timestamp (used to generate sequential times)
const BASE_TIME = new Date('2026-01-29T09:00:00Z').getTime();

// ============================================================
// Data Provider Implementation
// ============================================================

export class VLAResearchDemoProvider implements IDemoDataProvider {
  private baseTime: number;
  private interactionState: Map<string, boolean> = new Map();

  constructor() {
    this.baseTime = BASE_TIME;
  }

  getDemoFlowConfig(): DemoFlowConfig {
    return {
      id: 'vla-research-demo',
      name: 'VLA Model Research Demo',
      description: 'Complete VLA-RAIL paper analysis, experiment, visualization, and paper writing workflow',
      steps: this.buildAllSteps(),
      totalDuration: VLA_DEMO_STEPS.reduce((sum, s) => sum + s.expectedDuration, 0),
    };
  }

  getParticipants(): Participant[] {
    return [
      {
        id: USER_ID,
        name: USER_NAME,
        type: 'user',
        status: 'online',
        role: 'owner',
      },
      {
        id: DEMO_AGENTS['agent-research'].id,
        name: DEMO_AGENTS['agent-research'].name,
        type: 'agent',
        status: 'online',
        role: 'agent',
      },
      {
        id: DEMO_AGENTS['agent-code'].id,
        name: DEMO_AGENTS['agent-code'].name,
        type: 'agent',
        status: 'online',
        role: 'agent',
      },
      {
        id: DEMO_AGENTS['agent-writing'].id,
        name: DEMO_AGENTS['agent-writing'].name,
        type: 'agent',
        status: 'online',
        role: 'agent',
      },
    ];
  }

  getInitialTasks(): Task[] {
    return [
      {
        id: 'task-vla-research',
        title: 'VLA Model Research Analysis',
        description: 'Analyze VLA-RAIL paper, run benchmark comparison, write experiment section',
        status: 'running',
        progress: 0,
        startTime: this.getTimeStr(0),
        subtasks: [
          { id: 'subtask-1', parentId: 'task-vla-research', title: 'Paper Analysis', status: 'pending' },
          { id: 'subtask-2', parentId: 'task-vla-research', title: 'Benchmark Experiment', status: 'pending' },
          { id: 'subtask-3', parentId: 'task-vla-research', title: 'Visualization', status: 'pending' },
          { id: 'subtask-4', parentId: 'task-vla-research', title: 'Paper Writing', status: 'pending' },
        ],
      },
    ];
  }

  getStepMessages(stepIndex: number): ExtendedChatMessage[] {
    const builders: (() => ExtendedChatMessage[])[] = [
      () => this.buildStep1Messages(),
      () => this.buildStep2Messages(),
      () => this.buildStep3Messages(),
      () => this.buildStep4Messages(),
      () => this.buildStep5Messages(),
      () => this.buildStep6Messages(),
      () => this.buildStep7Messages(),
      () => this.buildStep8Messages(),
      () => this.buildStep9Messages(),
    ];

    return builders[stepIndex]?.() ?? [];
  }

  getStepTimelineEvents(stepIndex: number): ExtendedTimelineEvent[] {
    const builders: (() => ExtendedTimelineEvent[])[] = [
      () => this.buildStep1Timeline(),
      () => this.buildStep2Timeline(),
      () => this.buildStep3Timeline(),
      () => this.buildStep4Timeline(),
      () => this.buildStep5Timeline(),
      () => this.buildStep6Timeline(),
      () => this.buildStep7Timeline(),
      () => this.buildStep8Timeline(),
      () => this.buildStep9Timeline(),
    ];

    return builders[stepIndex]?.() ?? [];
  }

  handleInteraction(componentId: string, actionId: string, data?: unknown): InteractionHandlerResult {
    // Handle interaction based on component ID and action ID
    if (componentId === 'step1-confirm') {
      if (actionId === 'yes') {
        this.interactionState.set('confirmed', true);
        return { triggerNextStep: true };
      }
    }

    if (componentId === 'step5-viz') {
      if (actionId === 'visualize') {
        return { triggerNextStep: true };
      }
    }

    if (componentId === 'step6-write') {
      if (actionId === 'write-paper') {
        return { triggerNextStep: true };
      }
    }

    return {};
  }

  // ==================== Step Builders ====================

  private buildAllSteps(): DemoStep[] {
    return VLA_DEMO_STEPS.map((template, index) => ({
      id: template.id,
      order: index,
      title: template.title,
      description: template.description,
      messages: this.getStepMessages(index),
      timelineEvents: this.getStepTimelineEvents(index),
      expectedDuration: template.expectedDuration,
    }));
  }

  // Step 1: Agent Initiates
  private buildStep1Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-research',
        'Good morning! I noticed your research progress on VLA models yesterday. There are a few newly published related papers today. Would you like me to help analyze them?',
        0,
        {
          interactiveComponents: [
            {
              type: 'button-group',
              id: 'step1-confirm',
              buttons: [
                { id: 'yes', label: 'Start', variant: 'primary' },
                { id: 'later', label: 'Later', variant: 'secondary' },
                { id: 'details', label: 'Details', variant: 'ghost' },
              ],
            },
          ],
        }
      ),
    ];
  }

  private buildStep1Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'ai-editor',
        'navigate',
        'Agent initiates conversation',
        'agent-research',
        0
      ),
    ];
  }

  // Step 2: User Confirms
  private buildStep2Messages(): ExtendedChatMessage[] {
    return [
      this.createUserMessage(
        'Sure, help me analyze them. Especially do a benchmark comparison with previous methods to see the performance improvement.',
        60000
      ),
      this.createAgentMessage(
        'agent-research',
        'Got it! I\'ll load the VLA-RAIL paper for in-depth analysis first, then compile the benchmark comparison data.',
        90000,
        {
          actions: [
            this.createAction('search_papers', 'completed', 'Search latest VLA papers', 3000),
          ],
          uiDirectives: [
            { type: 'switch_component', target: 'pdf-reader', delay: 500 },
          ],
        }
      ),
    ];
  }

  private buildStep2Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'ai-editor',
        'edit',
        'User confirms analysis requirements',
        USER_ID,
        60000
      ),
    ];
  }

  // Step 3: PDF Analysis
  private buildStep3Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-research',
        'Loading VLA-RAIL: A Real-Time Asynchronous Inference Linker for VLA Models and Robots...',
        120000,
        {
          actions: [
            this.createAction('analyze_paper', 'running', 'Extracting key information'),
          ],
          uiDirectives: [
            {
              type: 'load_document',
              target: 'pdf-reader',
              data: { documentId: 'library/vla-rail.pdf', page: 1 },
            },
          ],
        }
      ),
      this.createAgentMessage(
        'agent-research',
        'Analysis complete! Key innovations in VLA-RAIL:\n\n1. **Asynchronous Inference Linker Design** - Decouples perception and action generation\n2. **40% Real-time Performance Improvement** - Latency reduced from 200ms to 120ms\n3. **Native ROS2 Integration** - Supports multi-robot coordination\n\nThese findings provide a great contrast with the synchronous inference methods you researched before.',
        180000,
        {
          actions: [
            this.createAction('analyze_paper', 'completed', 'Paper analysis complete', 60000),
            this.createAction('draw_conclusion', 'completed', 'Summarize key innovations'),
          ],
        }
      ),
    ];
  }

  private buildStep3Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'pdf-reader',
        'navigate',
        'Open VLA-RAIL paper',
        'agent-research',
        120000,
        {
          id: `snapshot-step3`,
          timestamp: this.baseTime + 120000,
          layout: {
            chatExpanded: true,
            chatPanelWidth: 420,
            taskPanelHeight: 'collapsed',
            activeComponent: 'pdf-reader',
          },
          components: {
            'pdf-reader': {
              documentId: 'library/vla-rail.pdf',
              currentPage: 1,
              totalPages: 12,
            },
          },
        }
      ),
    ];
  }

  // Step 4: Code Agent
  // Note: Actual benchmark code is displayed in WindowViewer (Code Playground)
  private buildStep4Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-research',
        'Found an interesting optimization point: VLA-RAIL\'s asynchronous inference linker design differs significantly from previous methods. Let me call Code Agent to verify the performance difference.',
        240000,
        {
          agentHandoff: {
            targetAgent: 'agent-code',
            reason: 'Need code to verify performance difference',
            context: { task: 'implement_benchmark' },
          },
        }
      ),
      this.createAgentMessage(
        'agent-code',
        'Got it! I\'m writing a benchmark script in **Code Playground** → check the right panel to see the code.',
        270000,
        {
          actions: [
            this.createAction('write_content', 'running', 'Writing benchmark code'),
          ],
          uiDirectives: [
            { type: 'switch_component', target: 'code-playground', delay: 500 },
          ],
        }
      ),
      this.createAgentMessage(
        'agent-code',
        'Benchmark complete! Results:\n\n```\nRunning benchmark...\nSync: 201.3ms, 159.0 samples/s\nAsync: 121.5ms, 263.4 samples/s\nSpeedup: 1.66x\n```\n\nThe async inference linker indeed shows significant performance improvement!',
        300000,
        {
          actions: [
            this.createAction('write_content', 'completed', 'Benchmark code complete'),
            this.createAction('execute_code', 'completed', 'Run benchmark', 3000),
          ],
        }
      ),
    ];
  }

  private buildStep4Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'code-playground',
        'navigate',
        'Switch to code editor',
        'agent-code',
        270000
      ),
      this.createTimelineEvent(
        'code-playground',
        'edit',
        'Write benchmark code',
        'agent-code',
        280000
      ),
      this.createTimelineEvent(
        'code-playground',
        'execute',
        'Run benchmark',
        'agent-code',
        300000
      ),
    ];
  }

  // Step 5: Jupyter Visualization
  private buildStep5Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-code',
        'I suggest creating a visualization for better clarity. Want me to generate performance comparison charts?',
        360000,
        {
          interactiveComponents: [
            {
              type: 'button-group',
              id: 'step5-viz',
              buttons: [
                { id: 'visualize', label: 'Visualize', variant: 'primary' },
                { id: 'export', label: 'Export', variant: 'secondary' },
              ],
            },
          ],
        }
      ),
      this.createAgentMessage(
        'agent-code',
        'Generating visualization charts in Jupyter...',
        390000,
        {
          actions: [
            this.createAction('write_content', 'running', 'Generate visualization code'),
          ],
          uiDirectives: [
            { type: 'switch_component', target: 'jupyter-notebook', delay: 500 },
          ],
        }
      ),
      this.createAgentMessage(
        'agent-code',
        'Visualization complete! Generated latency and throughput comparison charts, saved as `benchmark_comparison.png`.',
        420000,
        {
          actions: [
            this.createAction('write_content', 'completed', 'Visualization code complete'),
            this.createAction('execute_code', 'completed', 'Chart generation complete', 2000),
          ],
        }
      ),
    ];
  }

  private buildStep5Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'jupyter-notebook',
        'navigate',
        'Switch to Jupyter',
        'agent-code',
        390000
      ),
      this.createTimelineEvent(
        'jupyter-notebook',
        'execute',
        'Run visualization code',
        'agent-code',
        420000
      ),
    ];
  }

  // Step 6: Summary Prompt
  private buildStep6Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-research',
        '🎉 **Experiment Complete!**\n\nHere\'s a summary of our findings:\n\n📊 **Benchmark Results**\n- Latency reduction: 39.6% (201ms → 121ms)\n- Throughput improvement: 65.7% (159 → 263 samples/s)\n\n📝 **Key Findings**\n- VLA-RAIL\'s async inference linker design is indeed effective\n- Performance gains mainly from pipeline parallelism\n\nAll experimental data and analysis have been organized in AI Editor. Would you like me to help write the experiment section for your paper?',
        480000,
        {
          uiDirectives: [
            { type: 'switch_component', target: 'ai-editor', delay: 500 },
          ],
          interactiveComponents: [
            {
              type: 'choice-card',
              id: 'step6-write',
              title: 'Next Steps',
              options: [
                {
                  id: 'write-paper',
                  icon: '📄',
                  label: 'Write Paper',
                  description: 'Write experiment results to LaTeX document',
                },
                {
                  id: 'more-experiments',
                  icon: '🔬',
                  label: 'More Experiments',
                  description: 'Validate on other datasets',
                },
                {
                  id: 'save-notes',
                  icon: '📝',
                  label: 'Save Notes',
                  description: 'Save to AI Editor only',
                },
              ],
            },
          ],
        }
      ),
    ];
  }

  private buildStep6Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'ai-editor',
        'navigate',
        'Return to AI Editor for summary',
        'agent-research',
        480000
      ),
    ];
  }

  // Step 7: User References Notes
  private buildStep7Messages(): ExtendedChatMessage[] {
    return [
      this.createUserMessage(
        'Yes, write the paper. #Transformer Study Notes has method comparisons I organized before, please reference that too.',
        540000,
        ['#Transformer Study Notes']
      ),
      this.createAgentMessage(
        'agent-writing',
        'Got it! I\'ll combine your notes with today\'s experiment results to write the experiment section. Analyzing note content...',
        570000,
        {
          actions: [
            this.createAction('analyze_paper', 'completed', 'Analyze note content', 2000),
          ],
        }
      ),
    ];
  }

  private buildStep7Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'ai-editor',
        'edit',
        'User references study notes',
        USER_ID,
        540000
      ),
    ];
  }

  // Step 8: LaTeX Writing
  private buildStep8Messages(): ExtendedChatMessage[] {
    const latexContent = `\\section{Experiments}

\\subsection{Experimental Setup}

We evaluate the performance of VLA-RAIL against the baseline synchronous inference approach. Our experiments are conducted on a simulated robotic manipulation task using the following configuration:

\\begin{itemize}
    \\item Hardware: NVIDIA RTX 4090, 64GB RAM
    \\item Batch size: 32
    \\item Number of trials: 1000
\\end{itemize}

\\subsection{Results}

Table~\\ref{tab:benchmark} summarizes the performance comparison between synchronous inference and our proposed VLA-RAIL approach.

\\begin{table}[h]
\\centering
\\begin{tabular}{lcc}
\\toprule
Method & Latency (ms) & Throughput (samples/s) \\\\
\\midrule
Sync Inference & 201.3 & 159.0 \\\\
VLA-RAIL (Ours) & \\textbf{121.5} & \\textbf{263.4} \\\\
\\bottomrule
\\end{tabular}
\\caption{Performance comparison on inference benchmark.}
\\label{tab:benchmark}
\\end{table}

As shown in the results, VLA-RAIL achieves a \\textbf{39.6\\%} reduction in latency and \\textbf{65.7\\%} improvement in throughput compared to the synchronous baseline.`;

    return [
      this.createAgentMessage(
        'agent-writing',
        'Starting to write LaTeX document. I\'ll write the experiment methods and conclusions paragraph by paragraph...',
        600000,
        {
          actions: [
            this.createAction('write_content', 'running', 'Writing experiment methods'),
          ],
          uiDirectives: [
            { type: 'switch_component', target: 'latex-editor', delay: 500 },
            {
              type: 'highlight_diff',
              target: 'latex-editor',
              data: {
                file: 'paper.tex',
                changes: [
                  {
                    type: 'insert',
                    range: { start: 0, end: 50 },
                    newContent: latexContent,
                  },
                ],
              },
              delay: 1000,
            },
          ],
        }
      ),
      this.createAgentMessage(
        'agent-writing',
        'Experiment section complete! Updating references...',
        660000,
        {
          actions: [
            this.createAction('write_content', 'completed', 'Experiment section complete'),
            this.createAction('write_content', 'running', 'Updating references'),
          ],
        }
      ),
      this.createAgentMessage(
        'agent-writing',
        'References updated, added VLA-RAIL paper citation. LaTeX compilation successful!',
        690000,
        {
          actions: [
            this.createAction('write_content', 'completed', 'References update complete'),
          ],
        }
      ),
    ];
  }

  private buildStep8Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'latex-editor',
        'navigate',
        'Switch to LaTeX editor',
        'agent-writing',
        600000
      ),
      this.createTimelineEvent(
        'latex-editor',
        'edit',
        'Write experiment section',
        'agent-writing',
        630000,
        undefined,
        {
          component: 'latex-editor',
          file: 'paper.tex',
          changes: [
            {
              type: 'insert',
              range: { start: 0, end: 50 },
              newContent: '\\section{Experiments}...',
            },
          ],
        }
      ),
      this.createTimelineEvent(
        'latex-editor',
        'edit',
        'Update references',
        'agent-writing',
        690000
      ),
    ];
  }

  // Step 9: Final Report
  private buildStep9Messages(): ExtendedChatMessage[] {
    return [
      this.createAgentMessage(
        'agent-research',
        '🎉 **Task Complete!**\n\nSummary of today\'s research work:\n\n✅ **Completed Work**\n1. Analyzed key innovations in VLA-RAIL paper\n2. Implemented and ran performance benchmark\n3. Generated visualization comparison charts\n4. Wrote paper experiment section\n5. Updated references\n\n📁 **Output Files**\n- `benchmark.py` - Benchmark script\n- `benchmark_comparison.png` - Visualization charts\n- `paper.tex` - Updated paper\n- `references.bib` - References\n\n⏱️ **Time spent**: 15 minutes\n\nAnything else you need help with?',
        750000,
        {
          uiDirectives: [
            { type: 'switch_component', target: 'ai-editor', delay: 500 },
          ],
          interactiveComponents: [
            {
              type: 'summary-card',
              id: 'step9-summary',
              title: 'Task Statistics',
              stats: [
                { label: 'Papers Analyzed', value: '1', icon: '📄' },
                { label: 'Code Files', value: '2', icon: '💻' },
                { label: 'Visualizations', value: '1', icon: '📊' },
                { label: 'Sections Updated', value: '2', icon: '✍️' },
              ],
              actions: [
                { id: 'view-timeline', label: 'Timeline', variant: 'secondary' },
                { id: 'export-all', label: 'Export', variant: 'primary' },
              ],
            },
          ],
        }
      ),
    ];
  }

  private buildStep9Timeline(): ExtendedTimelineEvent[] {
    return [
      this.createTimelineEvent(
        'ai-editor',
        'navigate',
        'Final summary report',
        'agent-research',
        750000
      ),
    ];
  }

  // ==================== Helper Methods ====================

  private getTimeStr(offsetMs: number): string {
    return new Date(this.baseTime + offsetMs).toISOString();
  }

  private createUserMessage(
    content: string,
    offsetMs: number,
    references?: string[]
  ): ExtendedChatMessage {
    return {
      id: generateId('msg'),
      workspaceId: WORKSPACE_ID,
      senderId: USER_ID,
      senderType: 'user',
      senderName: USER_NAME,
      content,
      contentType: 'text',
      timestamp: this.getTimeStr(offsetMs),
      references,
    };
  }

  private createAgentMessage(
    agentId: string,
    content: string,
    offsetMs: number,
    options?: {
      actions?: AgentAction[];
      uiDirectives?: UIDirective[];
      interactiveComponents?: InteractiveComponent[];
      agentHandoff?: {
        targetAgent: string;
        reason: string;
        context?: Record<string, unknown>;
      };
    }
  ): ExtendedChatMessage {
    const agent = DEMO_AGENTS[agentId];
    return {
      id: generateId('msg'),
      workspaceId: WORKSPACE_ID,
      senderId: agentId,
      senderType: 'agent',
      senderName: agent?.name ?? agentId,
      content,
      contentType: content.includes('```') ? 'markdown' : 'text',
      timestamp: this.getTimeStr(offsetMs),
      actions: options?.actions,
      uiDirectives: options?.uiDirectives,
      interactiveComponents: options?.interactiveComponents,
      agentHandoff: options?.agentHandoff,
    };
  }

  private createAction(
    type: AgentAction['type'],
    status: AgentAction['status'],
    description: string,
    duration?: number
  ): AgentAction {
    return {
      id: generateId('action'),
      type,
      status,
      description,
      timestamp: getTimestamp(),
      duration,
    };
  }

  private createTimelineEvent(
    componentType: ExtendedTimelineEvent['componentType'],
    action: ExtendedTimelineEvent['action'],
    description: string,
    actorId: string,
    offsetMs: number,
    stateSnapshot?: StateSnapshot,
    diff?: StateSnapshot['diff']
  ): ExtendedTimelineEvent {
    const defaultSnapshot: StateSnapshot = {
      id: generateId('snapshot'),
      timestamp: this.baseTime + offsetMs,
      layout: {
        chatExpanded: true,
        chatPanelWidth: 420,
        taskPanelHeight: 'collapsed',
        activeComponent: componentType,
      },
      components: {},
      diff,
    };
    
    return {
      id: generateId('tl'),
      timestamp: this.baseTime + offsetMs,
      componentType,
      action,
      description,
      actorId,
      actorType: actorId === USER_ID ? 'user' : 'agent',
      stateSnapshot: stateSnapshot || defaultSnapshot,
    };
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Create VLA Research Demo Data Provider
 */
export function createVLAResearchDemoProvider(): IDemoDataProvider {
  return new VLAResearchDemoProvider();
}

// ============================================================
// Default Export
// ============================================================

export default VLAResearchDemoProvider;

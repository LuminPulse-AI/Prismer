/**
 * VLA Enhanced Demo Data
 *
 * VLA research demo using the new event-driven architecture.
 * Each step waits for the component to truly complete its operation before advancing.
 */

import type { ExtendedChatMessage, ExtendedTimelineEvent, Participant, Task } from '@/app/workspace/types';
import {
  type EnhancedDemoStep,
  type DemoStepTransition
} from '@/app/workspace/lib/demoFlowController';
import {
  type AwaitableAction,
  createLoadDocumentAction,
  createSendChatAction,
  createRunCellAction,
  createCompileLatexAction,
  createExecuteCodeAction,
} from '@/app/workspace/lib/actionExecutor';

// ============================================================
// Constants
// ============================================================

const WORKSPACE_ID = 'workspace-vla-research';
const USER_ID = 'user-1';
const USER_NAME = 'Me';

const AGENTS = {
  research: { id: 'agent-research', name: 'Aria (Research)' },
  code: { id: 'agent-code', name: 'CodeBot' },
  writing: { id: 'agent-writing', name: 'Quill (Writing)' },
};

// ============================================================
// Helper Functions
// ============================================================

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function createMessage(
  senderId: string,
  senderName: string,
  content: string,
  options: Partial<ExtendedChatMessage> = {}
): ExtendedChatMessage {
  return {
    id: generateId(),
    workspaceId: WORKSPACE_ID,
    senderId,
    senderType: senderId.startsWith('agent') ? 'agent' : 'user',
    senderName,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...options,
  };
}

// ============================================================
// Demo Content
// ============================================================

// Benchmark result data for AG Grid
const BENCHMARK_RESULTS = [
  { model: 'RT-1', latency: 120, successRate: 72.3, memory: '8.2 GB', params: '35M' },
  { model: 'OpenVLA', latency: 85, successRate: 81.2, memory: '12.4 GB', params: '7B' },
  { model: 'VLA-RAIL', latency: 45, successRate: 89.1, memory: '6.8 GB', params: '2.1B' },
  { model: 'VLA-RAIL+', latency: 32, successRate: 93.4, memory: '7.2 GB', params: '2.3B' },
];

const BENCHMARK_COLUMNS = [
  { field: 'model', headerName: 'Model', width: 120 },
  { field: 'latency', headerName: 'Latency (ms)', width: 120, type: 'numericColumn' },
  { field: 'successRate', headerName: 'Success Rate (%)', width: 140, type: 'numericColumn' },
  { field: 'memory', headerName: 'Memory Usage', width: 120 },
  { field: 'params', headerName: 'Parameters', width: 100 },
];

// Benchmark code for Code Playground (Python script mode)
const BENCHMARK_CODE = `"""
VLA Model Benchmark Suite
=========================
Evaluates Vision-Language-Action models on robotic manipulation tasks.

Metrics: Inference latency, success rate, memory usage, motion smoothness
Benchmark: SIMPLER-Env (Google DeepMind, 2024)
"""

import time
import sys
import json
from dataclasses import dataclass
from typing import List, Dict
import random

# ============================================================
# Configuration
# ============================================================

@dataclass
class BenchmarkConfig:
    num_episodes: int = 100
    num_warmup: int = 10
    timeout_ms: float = 500.0
    tasks: List[str] = None
    
    def __post_init__(self):
        if self.tasks is None:
            self.tasks = [
                "pick_cube", "place_cube", "stack_blocks", 
                "open_drawer", "close_drawer", "pour_water"
            ]

config = BenchmarkConfig(num_episodes=50, num_warmup=5)

# ============================================================
# Model Definitions
# ============================================================

MODELS = {
    "RT-1": {
        "params": "35M",
        "base_latency": 120,
        "base_success": 72.3,
        "memory_gb": 8.2,
        "checkpoint": "rt1-robotics-transformer"
    },
    "OpenVLA": {
        "params": "7B", 
        "base_latency": 85,
        "base_success": 81.2,
        "memory_gb": 12.4,
        "checkpoint": "openvla-7b-prismatic"
    },
    "VLA-RAIL": {
        "params": "2.1B",
        "base_latency": 45,
        "base_success": 89.1,
        "memory_gb": 6.8,
        "checkpoint": "vla-rail-2b-v1"
    },
    "VLA-RAIL+": {
        "params": "2.3B",
        "base_latency": 32,
        "base_success": 93.4,
        "memory_gb": 7.2,
        "checkpoint": "vla-rail-plus-2b-v1"
    }
}

# ============================================================
# Benchmark Runner
# ============================================================

def progress_bar(current, total, width=40, prefix=""):
    """Display a progress bar."""
    percent = current / total
    filled = int(width * percent)
    bar = "█" * filled + "░" * (width - filled)
    sys.stdout.write(f"\\r{prefix} |{bar}| {percent*100:.1f}%")
    sys.stdout.flush()
    if current == total:
        print()

def simulate_inference(model_config: dict, task: str) -> Dict:
    """Simulate model inference on a task."""
    base_latency = model_config["base_latency"]
    base_success = model_config["base_success"]
    
    # Add realistic variance
    latency = base_latency + random.gauss(0, base_latency * 0.05)
    success = random.random() < (base_success / 100)
    
    # Simulate computation time
    time.sleep(0.02)
    
    return {
        "latency_ms": max(1, latency),
        "success": success,
        "task": task
    }

def run_benchmark(model_name: str, model_config: dict) -> Dict:
    """Run full benchmark for a model."""
    results = {
        "latencies": [],
        "successes": 0,
        "total": 0
    }
    
    total_runs = config.num_warmup + config.num_episodes
    
    for i in range(total_runs):
        task = random.choice(config.tasks)
        result = simulate_inference(model_config, task)
        
        # Skip warmup runs for metrics
        if i >= config.num_warmup:
            results["latencies"].append(result["latency_ms"])
            results["successes"] += int(result["success"])
            results["total"] += 1
        
        progress_bar(i + 1, total_runs, prefix=f"  {model_name}")
    
    return results

# ============================================================
# Main Execution
# ============================================================

print("=" * 60)
print("  VLA Model Benchmark Suite v1.0")
print("  Benchmark: SIMPLER-Env | Episodes:", config.num_episodes)
print("=" * 60)
print()

all_results = {}

for model_name, model_config in MODELS.items():
    print(f"\\n📦 Loading {model_name} ({model_config['params']} params)...")
    print(f"   Checkpoint: {model_config['checkpoint']}")
    print(f"   Memory: {model_config['memory_gb']} GB")
    time.sleep(0.3)  # Simulate loading
    
    print(f"\\n🔬 Running benchmark...")
    results = run_benchmark(model_name, model_config)
    
    avg_latency = sum(results["latencies"]) / len(results["latencies"])
    success_rate = (results["successes"] / results["total"]) * 100
    
    all_results[model_name] = {
        "avg_latency_ms": round(avg_latency, 1),
        "success_rate": round(success_rate, 1),
        "memory_gb": model_config["memory_gb"],
        "params": model_config["params"]
    }
    
    print(f"   ✓ Avg Latency: {avg_latency:.1f} ms")
    print(f"   ✓ Success Rate: {success_rate:.1f}%")

# ============================================================
# Results Summary
# ============================================================

print("\\n" + "=" * 60)
print("  BENCHMARK RESULTS")
print("=" * 60)
print(f"{'Model':<12} {'Latency':>10} {'Success':>10} {'Memory':>10} {'Params':>8}")
print("-" * 60)

for model, metrics in all_results.items():
    print(f"{model:<12} {metrics['avg_latency_ms']:>8.1f}ms {metrics['success_rate']:>9.1f}% {metrics['memory_gb']:>8.1f}GB {metrics['params']:>8}")

print("-" * 60)

# Calculate improvements
rt1_latency = all_results["RT-1"]["avg_latency_ms"]
vla_latency = all_results["VLA-RAIL"]["avg_latency_ms"]
improvement = ((rt1_latency - vla_latency) / rt1_latency) * 100

print(f"\\n📊 Key Findings:")
print(f"   • VLA-RAIL achieves {improvement:.0f}% lower latency vs RT-1")
print(f"   • VLA-RAIL+ reaches {all_results['VLA-RAIL+']['success_rate']}% success rate")
print(f"   • Memory efficient: {all_results['VLA-RAIL']['memory_gb']}GB vs {all_results['OpenVLA']['memory_gb']}GB (OpenVLA)")

print("\\n✅ Benchmark complete. Results saved to benchmark_results.json")

# Save results
with open("benchmark_results.json", "w") as f:
    json.dump(all_results, f, indent=2)
`;

// Visualization code for Jupyter
const VISUALIZATION_CODE = `import matplotlib.pyplot as plt
import numpy as np

# Benchmark data
models = ['RT-1', 'OpenVLA', 'VLA-RAIL', 'VLA-RAIL+']
latency = [120, 85, 45, 32]  # ms
success_rate = [72, 81, 89, 93]  # %

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

# Latency comparison
colors = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1']
bars = ax1.bar(models, latency, color=colors)
ax1.set_ylabel('Latency (ms)', fontsize=12)
ax1.set_title('Inference Latency Comparison', fontsize=14, fontweight='bold')
ax1.set_ylim(0, 150)
for bar, val in zip(bars, latency):
    ax1.text(bar.get_x() + bar.get_width()/2, val + 3, f'{val}ms', 
             ha='center', fontsize=10)

# Success rate comparison
ax2.bar(models, success_rate, color=colors)
ax2.set_ylabel('Success Rate (%)', fontsize=12)
ax2.set_title('Task Success Rate Comparison', fontsize=14, fontweight='bold')
ax2.set_ylim(0, 100)
for i, val in enumerate(success_rate):
    ax2.text(i, val + 2, f'{val}%', ha='center', fontsize=10)

plt.tight_layout()
plt.savefig('benchmark_comparison.png', dpi=150, bbox_inches='tight')
plt.show()

print("✅ Visualization saved to benchmark_comparison.png")`;

// Experiment section LaTeX
const EXPERIMENT_LATEX = `\\section{Experiments}

\\subsection{Benchmark Setup}
We evaluate VLA-RAIL on a comprehensive benchmark suite covering:
\\begin{itemize}
  \\item Dynamic manipulation tasks (pick-and-place, assembly)
  \\item Navigation with moving obstacles
  \\item Multi-step manipulation sequences
\\end{itemize}

\\subsection{Results}

\\begin{table}[h]
\\centering
\\caption{Performance Comparison}
\\begin{tabular}{lccc}
\\hline
\\textbf{Model} & \\textbf{Latency (ms)} & \\textbf{Success (\\%)} & \\textbf{Smoothness} \\\\
\\hline
RT-1 & 120 & 72.3 & 0.65 \\\\
OpenVLA & 85 & 81.2 & 0.78 \\\\
VLA-RAIL & 45 & 89.1 & 0.92 \\\\
VLA-RAIL+ & 32 & 93.4 & 0.96 \\\\
\\hline
\\end{tabular}
\\end{table}

\\subsection{Analysis}
The results demonstrate that VLA-RAIL achieves:
\\begin{enumerate}
  \\item \\textbf{62\\% lower latency} compared to baseline methods
  \\item \\textbf{15\\% higher success rate} on dynamic tasks
  \\item \\textbf{Superior motion smoothness} (0.92 vs 0.65 baseline)
\\end{enumerate}`;

// ============================================================
// Enhanced Demo Steps
// ============================================================

export function createEnhancedDemoSteps(): EnhancedDemoStep[] {
  return [
    // Step 1: Agent initiates - discovers new papers
    {
      id: 'step-1',
      order: 0,
      title: 'Agent Initiates',
      description: 'Agent discovers new VLA papers',
      actions: [], // No actions needed, just show the message
      messages: [
        createMessage(AGENTS.research.id, AGENTS.research.name, 
          'Good morning! I noticed your research progress on VLA models yesterday. There are a few newly published related papers today. Would you like me to help analyze them?',
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
      ],
      messagesTiming: 'after',
      // timelineEvents will be generated at execution time with correct timestamps
      timelineEvents: [],
      transition: {
        type: 'interaction',
        interactionTrigger: { componentId: 'step1-confirm', actionId: 'yes' },
      },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-1' },
    },

    // Step 2: User confirms, load paper and ask AI question
    {
      id: 'step-2',
      order: 1,
      title: 'Load Paper',
      description: 'Load VLA-RAIL paper into PDF Reader',
      actions: [
        {
          id: 'action-2-switch',
          type: 'switch_component',
          target: 'pdf-reader',
          params: {},
          completionEvent: { type: 'ready' },
          timeout: 5000,
        },
        // Use arxiv ID that exists in local data: 2512.25072v1 (Coordinated Humanoid Manipulation)
        createLoadDocumentAction('action-2-load', 'library/vla-rail.pdf', 30000),
        // Ask AI about key results
        createSendChatAction('action-2-chat', 'pdf-reader', 'What are the key results and innovations of this paper? Please summarize the main contributions.', 60000),
      ],
      messages: [
        createMessage(AGENTS.research.id, AGENTS.research.name,
          'Got it! I\'ve loaded the paper and asked the AI to analyze the key contributions.\n\n📖 Check the **AI Chat** panel on the right side for the analysis.',
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [], // Generated dynamically
      transition: { type: 'auto', autoDelay: 3000 },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-1', markComplete: true },
    },

    // Step 3: Load benchmark code into Code Playground
    {
      id: 'step-3',
      order: 2,
      title: 'Load Benchmark Code',
      description: 'Load benchmark script into Code Playground',
      actions: [
        {
          id: 'action-3-switch',
          type: 'switch_component',
          target: 'code-playground',
          params: {},
          completionEvent: { type: 'ready' },
          timeout: 5000,
        },
        {
          id: 'action-3-load',
          type: 'load_code',
          target: 'code-playground',
          params: {
            files: {
              'benchmark.py': { content: BENCHMARK_CODE, language: 'python' },
            },
            activeFile: 'benchmark.py',
          },
          completionEvent: { type: 'contentLoaded' },
          timeout: 15000, // Longer timeout for streaming code
        },
      ],
      messages: [
        createMessage(AGENTS.code.id, AGENTS.code.name,
          'I\'ve loaded the benchmark script into the **Code Playground**. This will compare inference latency and success rates across different VLA models.',
          {
            interactiveComponents: [
              {
                type: 'button-group',
                id: 'step3-actions',
                buttons: [
                  { id: 'run', label: 'Run', variant: 'primary' },
                ],
              },
            ],
          }
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [],
      transition: {
        type: 'interaction',
        interactionTrigger: { componentId: 'step3-actions', actionId: 'run' },
      },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-2' },
    },

    // Step 3b: Execute benchmark
    {
      id: 'step-3b',
      order: 3,
      title: 'Execute Benchmark',
      description: 'Run the benchmark script',
      actions: [
        createExecuteCodeAction('action-3b-execute', 'python benchmark.py', 30000),
      ],
      messages: [
        createMessage(AGENTS.code.id, AGENTS.code.name,
          '🔄 Running benchmark... Watch the terminal output below for real-time results.',
        ),
      ],
      messagesTiming: 'before',
      timelineEvents: [],
      transition: { type: 'auto', autoDelay: 1000 },
    },

    // Step 3c: Show results in AG Grid
    {
      id: 'step-3c',
      order: 4,
      title: 'Show Benchmark Results',
      description: 'Display results in data grid',
      actions: [
        {
          id: 'action-3c-switch',
          type: 'switch_component',
          target: 'ag-grid',
          params: {},
          completionEvent: { type: 'ready' },
          timeout: 5000,
        },
        {
          id: 'action-3c-load-data',
          type: 'load_data',
          target: 'ag-grid',
          params: {
            data: BENCHMARK_RESULTS,
            columns: BENCHMARK_COLUMNS,
          },
          completionEvent: { type: 'contentLoaded' },
          timeout: 5000,
        },
      ],
      messages: [
        createMessage(AGENTS.code.id, AGENTS.code.name,
          '✅ Benchmark complete! The results are now displayed in the **Data Grid**.\n\n**Key findings:**\n- VLA-RAIL achieves **62% lower latency** vs RT-1\n- VLA-RAIL+ reaches **93.4% success rate**\n- Memory usage is competitive at 6.8-7.2 GB\n\nWould you like to generate visualizations for these results?',
          {
            interactiveComponents: [
              {
                type: 'button-group',
                id: 'step3c-actions',
                buttons: [
                  { id: 'visualize', label: 'Visualize', variant: 'primary' },
                  { id: 'skip', label: 'Skip', variant: 'secondary' },
                ],
              },
            ],
          }
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [],
      transition: {
        type: 'interaction',
        interactionTrigger: { componentId: 'step3c-actions', actionId: 'visualize' },
      },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-2', markComplete: true },
    },

    // Step 4: Switch to Jupyter, add and run visualization code (combined for timing)
    {
      id: 'step-4',
      order: 5,
      title: 'Generate Visualization',
      description: 'Setup and run visualization in Jupyter',
      actions: [
        {
          id: 'action-4-switch',
          type: 'switch_component',
          target: 'jupyter-notebook',
          params: {},
          completionEvent: { type: 'ready' },
          timeout: 10000,
        },
        {
          id: 'action-4-add-and-run',
          type: 'add_and_run_cell',
          target: 'jupyter-notebook',
          params: { type: 'code', source: VISUALIZATION_CODE },
          completionEvent: { type: 'actionComplete', action: 'execute_cell' },
          timeout: 60000,
        },
      ],
      messages: [
        createMessage(AGENTS.code.id, AGENTS.code.name,
          '📊 Running visualization code in Jupyter...',
        ),
        createMessage(AGENTS.code.id, AGENTS.code.name,
          '🎨 Visualization complete! The charts show:\n\n• **62% lower latency** for VLA-RAIL vs baseline\n• **93% success rate** with VLA-RAIL+ variant',
        ),
      ],
      messagesTiming: 'during',
      timelineEvents: [],
      transition: { type: 'auto', autoDelay: 2000 },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-3', markComplete: true },
    },

    // Step 5: Ask user about inserting into paper
    {
      id: 'step-5',
      order: 6,
      title: 'Insert to Paper',
      description: 'Confirm inserting results into paper',
      actions: [],
      messages: [
        createMessage(AGENTS.writing.id, AGENTS.writing.name,
          'Great results! Would you like me to insert the analysis conclusions and charts into your paper?\n\n💡 *Tip: Use `#` to reference your LaTeX draft*',
          {
            interactiveComponents: [
              {
                type: 'button-group',
                id: 'step5-actions',
                buttons: [
                  { id: 'insert', label: 'Insert', variant: 'primary' },
                  { id: 'skip', label: 'Skip', variant: 'secondary' },
                ],
              },
            ],
          }
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [],
      transition: {
        type: 'interaction',
        interactionTrigger: { componentId: 'step5-actions', actionId: 'insert' },
      },
    },

    // Step 6: Switch to LaTeX and write paper (auto after user confirms)
    {
      id: 'step-6',
      order: 7,
      title: 'Write Paper Section',
      description: 'Add experiment section to paper',
      actions: [
        {
          id: 'action-6-switch',
          type: 'switch_component',
          target: 'latex-editor',
          params: {},
          completionEvent: { type: 'ready' },
          timeout: 5000,
        },
        {
          id: 'action-6-update',
          type: 'update_content',
          target: 'latex-editor',
          params: { file: 'experiment.tex', content: EXPERIMENT_LATEX },
          completionEvent: { type: 'contentLoaded' },
          timeout: 5000,
        },
      ],
      messages: [
        createMessage(AGENTS.writing.id, AGENTS.writing.name,
          '📝 Inserting analysis and charts into **experiment.tex**...\n\nThe section includes:\n• Benchmark methodology\n• Performance comparison table\n• Chart figures\n• Key findings analysis',
        ),
      ],
      messagesTiming: 'before',
      timelineEvents: [],
      transition: { type: 'auto', autoDelay: 1500 },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-4' },
    },

    // Step 7: Compile LaTeX (auto)
    {
      id: 'step-7',
      order: 8,
      title: 'Compile Paper',
      description: 'Compile LaTeX to PDF',
      actions: [
        createCompileLatexAction('action-7-compile', 30000),
      ],
      messages: [
        createMessage(AGENTS.writing.id, AGENTS.writing.name,
          '📄 **Paper compiled successfully!**\n\nThe PDF preview shows the formatted experiment section with the performance comparison table and visualization charts.',
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [],
      transition: { type: 'auto', autoDelay: 2000 },
      subtask: { taskId: 'task-vla-research', subtaskId: 'subtask-4', markComplete: true },
    },

    // Step 8: Summary
    {
      id: 'step-8',
      order: 9,
      title: 'Task Complete',
      description: 'Research workflow completed',
      actions: [],
      messages: [
        createMessage(AGENTS.research.id, AGENTS.research.name,
          '🎉 **Research Analysis Complete!**\n\n**Summary:**\n• Analyzed VLA-RAIL paper innovations\n• Generated benchmark comparison visualizations\n• Drafted experiment section for paper\n\n**Output Files:**\n• `benchmark_comparison.png` - Visualization charts\n• `experiment.tex` - Paper section\n• Compiled PDF preview',
        ),
      ],
      messagesTiming: 'after',
      timelineEvents: [], // Generated dynamically
      transition: { type: 'auto', autoDelay: 0 },
    },
  ];
}

// ============================================================
// Provider Functions
// ============================================================

export function getEnhancedParticipants(): Participant[] {
  return [
    // Human users
    { id: USER_ID, name: USER_NAME, type: 'user', status: 'online', role: 'owner' },
    { id: 'user-alice', name: 'Alice Chen', type: 'user', status: 'online', role: 'collaborator' },
    { id: 'user-bob', name: 'Bob Zhang', type: 'user', status: 'busy', role: 'advisor' },
    { id: 'user-carol', name: 'Carol Wang', type: 'user', status: 'offline', role: 'member' },
    // AI Agents
    { id: AGENTS.research.id, name: AGENTS.research.name, type: 'agent', status: 'online', role: 'agent' },
    { id: AGENTS.code.id, name: AGENTS.code.name, type: 'agent', status: 'online', role: 'agent' },
    { id: AGENTS.writing.id, name: AGENTS.writing.name, type: 'agent', status: 'online', role: 'agent' },
  ];
}

export function getEnhancedInitialTasks(): Task[] {
  return [
    {
      id: 'task-vla-research',
      title: 'VLA Model Research Analysis',
      description: 'Analyze VLA-RAIL paper, generate visualizations, write experiment section',
      status: 'pending',  // Start as pending - will change to running after user clicks "Start"
      progress: 0,
      subtasks: [
        { id: 'subtask-1', parentId: 'task-vla-research', title: 'Paper Analysis', status: 'pending' },
        { id: 'subtask-2', parentId: 'task-vla-research', title: 'Benchmark Setup', status: 'pending' },
        { id: 'subtask-3', parentId: 'task-vla-research', title: 'Visualization', status: 'pending' },
        { id: 'subtask-4', parentId: 'task-vla-research', title: 'Paper Writing', status: 'pending' },
      ],
    },
  ];
}

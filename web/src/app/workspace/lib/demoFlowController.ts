/**
 * Demo Flow Controller
 * 
 * Event-driven demo flow controller.
 * Waits for components to actually complete operations before advancing to the next step.
 */

import type { ComponentType, ExtendedChatMessage, ExtendedTimelineEvent, Task } from '../types';
import { componentEventBus, type ComponentEvent } from './componentEventBus';
import { actionExecutor, type AwaitableAction, type ActionResult } from './actionExecutor';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDemoStore } from '../stores/demoStore';

// ============================================================
// Demo Step Types
// ============================================================

export interface DemoStepTransition {
  type: 'auto' | 'interaction' | 'condition';
  
  // For 'interaction': which component/button triggers next step
  interactionTrigger?: {
    componentId: string;
    actionId: string;
  };
  
  // For 'condition': wait for these events
  conditions?: {
    events: Array<{
      component: ComponentType;
      type: string;
      action?: string;
    }>;
    logic: 'all' | 'any';
    timeout?: number;
  };
  
  // For 'auto': delay after actions complete
  autoDelay?: number;
}

export interface EnhancedDemoStep {
  id: string;
  order: number;
  title: string;
  description: string;
  
  // Actions to execute in sequence (with waiting)
  actions: AwaitableAction[];
  
  // Messages to show (can be shown during or after actions)
  messages: ExtendedChatMessage[];
  
  // When to show messages: 'before' actions, 'after' actions, or 'during'
  messagesTiming?: 'before' | 'after' | 'during';
  
  // Timeline events to record
  timelineEvents: ExtendedTimelineEvent[];
  
  // How to transition to next step
  transition: DemoStepTransition;
  
  // Subtask to update when this step starts/completes
  subtask?: {
    taskId: string;
    subtaskId: string;
    markComplete?: boolean; // Mark complete when step finishes
  };
  
  // Callback after step completes (for custom logic)
  onComplete?: (result: StepResult) => void;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  actionResults: ActionResult[];
  duration: number;
  error?: Error;
}

export interface DemoFlowState {
  currentStepIndex: number;
  isRunning: boolean;
  isPaused: boolean;
  stepResults: Map<string, StepResult>;
}

// ============================================================
// Demo Flow Controller
// ============================================================

export class DemoFlowController {
  private steps: EnhancedDemoStep[] = [];
  private state: DemoFlowState = {
    currentStepIndex: -1,
    isRunning: false,
    isPaused: false,
    stepResults: new Map(),
  };
  
  private interactionResolvers: Map<string, () => void> = new Map();
  private cleanupFunctions: (() => void)[] = [];

  /**
   * Initialize with demo steps
   */
  initialize(steps: EnhancedDemoStep[]): void {
    this.steps = steps;
    this.state = {
      currentStepIndex: -1,
      isRunning: false,
      isPaused: false,
      stepResults: new Map(),
    };
    console.log(`[DemoFlow] Initialized with ${steps.length} steps`);
  }

  /**
   * Start the demo from the beginning
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      console.warn('[DemoFlow] Demo already running');
      return;
    }
    
    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.currentStepIndex = -1;
    
    console.log('[DemoFlow] Starting demo...');
    await this.advanceToNextStep();
  }

  /**
   * Pause the demo
   */
  pause(): void {
    this.state.isPaused = true;
    console.log('[DemoFlow] Paused');
  }

  /**
   * Resume the demo
   */
  async resume(): Promise<void> {
    if (!this.state.isPaused) return;
    
    this.state.isPaused = false;
    console.log('[DemoFlow] Resumed');
    
    // If we were waiting for auto-transition, continue
    await this.advanceToNextStep();
  }

  /**
   * Stop the demo
   */
  stop(): void {
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.cleanup();
    console.log('[DemoFlow] Stopped');
  }

  /**
   * Handle user interaction (from ActionBar buttons, etc.)
   */
  handleInteraction(componentId: string, actionId: string): void {
    const key = `${componentId}:${actionId}`;
    console.log(`[DemoFlow] handleInteraction called: ${key}, waiting for:`, Array.from(this.interactionResolvers.keys()));
    const resolver = this.interactionResolvers.get(key);
    
    if (resolver) {
      console.log(`[DemoFlow] Interaction matched! Resolving: ${key}`);
      resolver();
      this.interactionResolvers.delete(key);
    } else {
      console.log(`[DemoFlow] No resolver found for: ${key}`);
    }
  }

  /**
   * Go to a specific step (for timeline scrubbing)
   */
  async goToStep(stepIndex: number): Promise<void> {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      console.warn(`[DemoFlow] Invalid step index: ${stepIndex}`);
      return;
    }
    
    // Stop current execution
    this.state.isPaused = true;
    this.cleanup();
    
    // Set new index
    this.state.currentStepIndex = stepIndex - 1;
    this.state.isPaused = false;
    
    // Execute the step
    await this.advanceToNextStep();
  }

  /**
   * Get current state
   */
  getState(): DemoFlowState {
    return { ...this.state };
  }

  /**
   * Get current step
   */
  getCurrentStep(): EnhancedDemoStep | null {
    if (this.state.currentStepIndex < 0 || this.state.currentStepIndex >= this.steps.length) {
      return null;
    }
    return this.steps[this.state.currentStepIndex];
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private async advanceToNextStep(): Promise<void> {
    if (!this.state.isRunning || this.state.isPaused) return;
    
    const nextIndex = this.state.currentStepIndex + 1;
    
    if (nextIndex >= this.steps.length) {
      console.log('[DemoFlow] Demo completed!');
      this.state.isRunning = false;
      return;
    }
    
    this.state.currentStepIndex = nextIndex;
    const step = this.steps[nextIndex];
    
    console.log(`[DemoFlow] Executing step ${nextIndex + 1}/${this.steps.length}: ${step.title}`);
    
    // Update store
    useDemoStore.setState({ currentDemoStepIndex: nextIndex });
    
    // Execute the step
    const result = await this.executeStep(step);
    this.state.stepResults.set(step.id, result);
    
    // Call completion callback
    step.onComplete?.(result);
    
    // Handle transition based on step configuration
    await this.handleTransition(step, result);
  }

  private async executeStep(step: EnhancedDemoStep): Promise<StepResult> {
    const startTime = Date.now();
    const store = useWorkspaceStore.getState();
    
    try {
      // Special handling: Update main task status to 'running' after user confirms (step 2)
      // This happens with a delay to give visual feedback
      if (step.order === 1) { // Step 2 is when user has confirmed
        // First delay before updating task status
        await new Promise(r => setTimeout(r, 1500));
        store.updateTask('task-vla-research', { 
          status: 'running', 
          startTime: new Date().toISOString() 
        });
      }
      
      // Update subtask to running
      if (step.subtask) {
        store.updateSubtaskStatus(step.subtask.taskId, step.subtask.subtaskId, 'running');
      }
      
      // Show messages before actions (if configured)
      if (step.messagesTiming === 'before' || step.messagesTiming === 'during') {
        await this.showMessages(step.messages, step.messagesTiming === 'during');
      }
      
      // Execute actions
      const actionResults = await actionExecutor.executeSequence(step.actions);
      
      // Check if any action failed
      const failed = actionResults.find(r => !r.success);
      if (failed) {
        throw failed.error ?? new Error('Action failed');
      }
      
      // Show messages after actions (default behavior)
      if (!step.messagesTiming || step.messagesTiming === 'after') {
        await this.showMessages(step.messages, false);
      }
      
      // Add timeline events with current timestamp
      step.timelineEvents.forEach(event => {
        store.addTimelineEvent({
          ...event,
          timestamp: Date.now(), // Override with current time
        });
      });
      
      // Also generate a timeline event for the step completion
      if (step.actions.length > 0) {
        const action = step.actions[step.actions.length - 1];
        store.addTimelineEvent({
          id: `timeline-${step.id}-${Date.now()}`,
          timestamp: Date.now(),
          componentType: action.target,
          action: action.type === 'execute_code' || action.type === 'run_cell' || action.type === 'compile_latex' 
            ? 'execute' 
            : action.type === 'update_content' || action.type === 'add_cell'
            ? 'create'
            : 'navigate',
          description: step.title,
          actorId: 'agent-research',
          actorType: 'agent',
        });
      }
      
      // Mark subtask complete if configured
      if (step.subtask?.markComplete) {
        store.updateSubtaskStatus(step.subtask.taskId, step.subtask.subtaskId, 'completed');
      }
      
      return {
        stepId: step.id,
        success: true,
        actionResults,
        duration: Date.now() - startTime,
      };
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[DemoFlow] Step failed:`, error);
      
      return {
        stepId: step.id,
        success: false,
        actionResults: [],
        duration: Date.now() - startTime,
        error,
      };
    }
  }

  private async showMessages(
    messages: ExtendedChatMessage[],
    parallel: boolean
  ): Promise<void> {
    const store = useWorkspaceStore.getState();
    
    if (parallel) {
      // Show all messages at once
      messages.forEach(msg => store.addMessage(msg));
    } else {
      // Show messages with delay
      for (let i = 0; i < messages.length; i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 0 : 500));
        store.addMessage(messages[i]);
      }
    }
  }

  private async handleTransition(step: EnhancedDemoStep, result: StepResult): Promise<void> {
    if (!result.success) {
      console.warn('[DemoFlow] Step failed, stopping demo');
      this.stop();
      return;
    }
    
    const { transition } = step;
    
    switch (transition.type) {
      case 'auto':
        // Wait for delay then advance
        const delay = transition.autoDelay ?? 2000;
        await new Promise(r => setTimeout(r, delay));
        await this.advanceToNextStep();
        break;
        
      case 'interaction':
        // Wait for user interaction
        if (transition.interactionTrigger) {
          await this.waitForInteraction(
            transition.interactionTrigger.componentId,
            transition.interactionTrigger.actionId
          );
          await this.advanceToNextStep();
        }
        break;
        
      case 'condition':
        // Wait for conditions
        if (transition.conditions) {
          await this.waitForConditions(transition.conditions);
          await this.advanceToNextStep();
        }
        break;
    }
  }

  private waitForInteraction(componentId: string, actionId: string): Promise<void> {
    const key = `${componentId}:${actionId}`;
    
    return new Promise(resolve => {
      this.interactionResolvers.set(key, resolve);
    });
  }

  private async waitForConditions(conditions: NonNullable<DemoStepTransition['conditions']>): Promise<void> {
    await componentEventBus.waitFor({
      events: conditions.events.map(e => ({
        component: e.component,
        type: e.type as any,
        action: e.action,
      })),
      logic: conditions.logic,
      timeout: conditions.timeout ?? 60000,
    });
  }

  private cleanup(): void {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
    this.interactionResolvers.clear();
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const demoFlowController = new DemoFlowController();

// ============================================================
// React Hook
// ============================================================

import { useEffect, useCallback } from 'react';

export function useDemoFlowController() {
  // Handle interaction from UI
  const handleInteraction = useCallback((componentId: string, actionId: string) => {
    demoFlowController.handleInteraction(componentId, actionId);
  }, []);
  
  // Start demo
  const startDemo = useCallback(() => {
    demoFlowController.start();
  }, []);
  
  // Pause demo
  const pauseDemo = useCallback(() => {
    demoFlowController.pause();
  }, []);
  
  // Resume demo
  const resumeDemo = useCallback(() => {
    demoFlowController.resume();
  }, []);
  
  // Stop demo
  const stopDemo = useCallback(() => {
    demoFlowController.stop();
  }, []);
  
  // Go to specific step
  const goToStep = useCallback((stepIndex: number) => {
    demoFlowController.goToStep(stepIndex);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      demoFlowController.stop();
    };
  }, []);
  
  return {
    handleInteraction,
    startDemo,
    pauseDemo,
    resumeDemo,
    stopDemo,
    goToStep,
    getState: () => demoFlowController.getState(),
    getCurrentStep: () => demoFlowController.getCurrentStep(),
  };
}

/**
 * UI Directive Executor
 * 
 * Executes UI directives issued by the Agent, controlling frontend state changes.
 * Supports delayed execution, batch execution, and animated transitions.
 */

import type {
  UIDirective,
  UIDirectiveType,
  ComponentType,
  ComponentStates,
  DiffChange,
} from '../types';

// ============================================================
// Types
// ============================================================

export interface DirectiveExecutionContext {
  setActiveComponent: (type: ComponentType) => void;
  updateComponentState: <K extends keyof ComponentStates>(
    component: K,
    state: Partial<ComponentStates[K]>
  ) => void;
  setActiveDiff: (diff: {
    component: ComponentType;
    file?: string;
    changes: DiffChange[];
  } | null) => void;
  setChatExpanded: (expanded: boolean) => void;
  setTaskPanelHeight: (height: 'collapsed' | '30%' | '80%') => void;
  showNotification?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  captureSnapshot?: () => void;
}

export interface DirectiveExecutorConfig {
  defaultDelay?: number;
  enableAnimations?: boolean;
  onDirectiveStart?: (directive: UIDirective) => void;
  onDirectiveComplete?: (directive: UIDirective) => void;
  onDirectiveError?: (directive: UIDirective, error: Error) => void;
}

// ============================================================
// Executor
// ============================================================

export class UIDirectiveExecutor {
  private context: DirectiveExecutionContext;
  private config: DirectiveExecutorConfig;
  private executionQueue: UIDirective[] = [];
  private isExecuting = false;

  constructor(context: DirectiveExecutionContext, config: DirectiveExecutorConfig = {}) {
    this.context = context;
    this.config = {
      defaultDelay: 0,
      enableAnimations: true,
      ...config,
    };
  }

  /**
   * Execute a single directive
   */
  async execute(directive: UIDirective): Promise<void> {
    const delay = directive.delay ?? this.config.defaultDelay ?? 0;

    // Delayed execution
    if (delay > 0) {
      await this.sleep(delay);
    }

    this.config.onDirectiveStart?.(directive);

    try {
      await this.executeDirective(directive);
      this.config.onDirectiveComplete?.(directive);
    } catch (error) {
      this.config.onDirectiveError?.(directive, error as Error);
      throw error;
    }
  }

  /**
   * Execute directives in batch (sequentially)
   */
  async executeAll(directives: UIDirective[]): Promise<void> {
    for (const directive of directives) {
      await this.execute(directive);
    }
  }

  /**
   * Enqueue a directive
   */
  enqueue(directive: UIDirective): void {
    this.executionQueue.push(directive);
    if (!this.isExecuting) {
      this.processQueue();
    }
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.executionQueue.length === 0) {
      return;
    }

    this.isExecuting = true;

    while (this.executionQueue.length > 0) {
      const directive = this.executionQueue.shift();
      if (directive) {
        await this.execute(directive);
      }
    }

    this.isExecuting = false;
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.executionQueue = [];
  }

  /**
   * Execute a specific directive
   */
  private async executeDirective(directive: UIDirective): Promise<void> {
    const { type, target, data } = directive;

    switch (type) {
      case 'switch_component':
        this.executeSwitchComponent(target as ComponentType);
        break;

      case 'load_document':
        await this.executeLoadDocument(target as string, data);
        break;

      case 'update_content':
        this.executeUpdateContent(target as keyof ComponentStates, data);
        break;

      case 'highlight_diff':
        this.executeHighlightDiff(target as ComponentType, data);
        break;

      case 'scroll_to':
        this.executeScrollTo(target as string, data);
        break;

      case 'open_panel':
        this.executeOpenPanel(target as string);
        break;

      case 'close_panel':
        this.executeClosePanel(target as string);
        break;

      case 'show_notification':
        this.executeShowNotification(data);
        break;

      case 'play_animation':
        await this.executePlayAnimation(target as string, data);
        break;

      case 'focus_element':
        this.executeFocusElement(target as string);
        break;

      default:
        console.warn(`Unknown directive type: ${type}`);
    }
  }

  // ==================== Directive Implementations ====================

  private executeSwitchComponent(component: ComponentType): void {
    this.context.setActiveComponent(component);
    this.context.captureSnapshot?.();
  }

  private async executeLoadDocument(
    component: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (component === 'pdf-reader' && data?.documentId) {
      this.context.updateComponentState('pdf-reader', {
        documentId: data.documentId as string,
        currentPage: (data.page as number) ?? 1,
      });
    } else if (component === 'latex-editor' && data?.file) {
      this.context.updateComponentState('latex-editor', {
        activeFile: data.file as string,
        content: data.content as string | undefined,
      });
    }
    
    this.context.captureSnapshot?.();
  }

  private executeUpdateContent(
    component: keyof ComponentStates,
    data?: Record<string, unknown>
  ): void {
    if (!data) return;
    this.context.updateComponentState(component, data as never);
    this.context.captureSnapshot?.();
  }

  private executeHighlightDiff(
    component: ComponentType,
    data?: Record<string, unknown>
  ): void {
    if (!data?.changes) {
      this.context.setActiveDiff(null);
      return;
    }

    this.context.setActiveDiff({
      component,
      file: data.file as string | undefined,
      changes: data.changes as DiffChange[],
    });
  }

  private executeScrollTo(target: string, data?: Record<string, unknown>): void {
    // Attempt to scroll to the specified element
    const selector = data?.selector as string ?? `#${target}`;
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({
        behavior: this.config.enableAnimations ? 'smooth' : 'auto',
        block: (data?.block as ScrollLogicalPosition) ?? 'center',
      });
    }
  }

  private executeOpenPanel(panel: string): void {
    switch (panel) {
      case 'chat':
        this.context.setChatExpanded(true);
        break;
      case 'task':
        this.context.setTaskPanelHeight('30%');
        break;
      case 'task-full':
        this.context.setTaskPanelHeight('80%');
        break;
    }
  }

  private executeClosePanel(panel: string): void {
    switch (panel) {
      case 'chat':
        this.context.setChatExpanded(false);
        break;
      case 'task':
        this.context.setTaskPanelHeight('collapsed');
        break;
    }
  }

  private executeShowNotification(data?: Record<string, unknown>): void {
    if (!data?.message) return;
    this.context.showNotification?.(
      data.message as string,
      (data.type as 'info' | 'success' | 'warning' | 'error') ?? 'info'
    );
  }

  private async executePlayAnimation(
    target: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.enableAnimations) return;

    const element = document.querySelector(`[data-animation-target="${target}"]`);
    if (!element) return;

    const animationClass = data?.animation as string ?? 'animate-pulse';
    const duration = (data?.duration as number) ?? 1000;

    element.classList.add(animationClass);
    await this.sleep(duration);
    element.classList.remove(animationClass);
  }

  private executeFocusElement(target: string): void {
    const element = document.querySelector(target) as HTMLElement;
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
  }

  // ==================== Utility Methods ====================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a UI Directive executor
 */
export function createUIDirectiveExecutor(
  context: DirectiveExecutionContext,
  config?: DirectiveExecutorConfig
): UIDirectiveExecutor {
  return new UIDirectiveExecutor(context, config);
}

// ============================================================
// Hooks Helper
// ============================================================

/**
 * Create an execution context from a Store
 */
export function createExecutionContextFromStore(store: {
  setActiveComponent: (type: ComponentType) => void;
  updateComponentState: <K extends keyof ComponentStates>(
    component: K,
    state: Partial<ComponentStates[K]>
  ) => void;
  setActiveDiff: (diff: {
    component: ComponentType;
    file?: string;
    changes: DiffChange[];
  } | null) => void;
  captureSnapshot: () => void;
}): DirectiveExecutionContext {
  return {
    setActiveComponent: store.setActiveComponent,
    updateComponentState: store.updateComponentState,
    setActiveDiff: store.setActiveDiff,
    setChatExpanded: () => {}, // Provided externally
    setTaskPanelHeight: () => {}, // Provided externally
    captureSnapshot: store.captureSnapshot,
  };
}

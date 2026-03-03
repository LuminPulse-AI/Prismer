'use client';

/**
 * InteractiveComponents
 *
 * Interactive component renderer - Dynamically renders the corresponding interactive component based on type
 */

import React, { memo, useCallback } from 'react';
import type { InteractiveComponent, InteractionEvent } from '../../types';
import { ButtonGroup } from './ButtonGroup';
import { ChoiceCard } from './ChoiceCard';
import { SummaryCard } from './SummaryCard';
import { ProgressCard } from './ProgressCard';
import { CodeBlock } from './CodeBlock';

interface InteractiveComponentRendererProps {
  components: InteractiveComponent[];
  messageId: string;
  onInteraction: (event: InteractionEvent) => void;
  disabled?: boolean;
  /** Force vertical layout for all button groups */
  layout?: 'horizontal' | 'vertical';
}

/**
 * Interactive component renderer
 * Receives an array of component configs and dynamically renders the corresponding components
 */
export const InteractiveComponentRenderer = memo(function InteractiveComponentRenderer({
  components,
  messageId,
  onInteraction,
  disabled = false,
  layout,
}: InteractiveComponentRendererProps) {
  const handleAction = useCallback((componentId: string, actionId: string, data?: unknown) => {
    onInteraction({
      componentId,
      actionId,
      data,
      timestamp: Date.now(),
    });
  }, [onInteraction]);

  if (!components || components.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {components.map((component) => {
        switch (component.type) {
          case 'button-group':
            // Override layout if provided from parent
            const buttonGroupConfig = layout 
              ? { ...component, layout } 
              : component;
            return (
              <ButtonGroup
                key={component.id}
                config={buttonGroupConfig}
                onAction={(actionId) => handleAction(component.id, actionId)}
                disabled={disabled}
              />
            );

          case 'choice-card':
            return (
              <ChoiceCard
                key={component.id}
                config={component}
                onAction={(actionId, data) => handleAction(component.id, actionId, data)}
                disabled={disabled}
              />
            );

          case 'summary-card':
            return (
              <SummaryCard
                key={component.id}
                config={component}
                onAction={(actionId) => handleAction(component.id, actionId)}
              />
            );

          case 'progress-card':
            return (
              <ProgressCard
                key={component.id}
                config={component}
                onAction={(actionId) => handleAction(component.id, actionId)}
              />
            );

          case 'code-block':
            // Code blocks should NOT be rendered inline in chat
            // They should be displayed in the WindowViewer (Code Playground)
            // Just skip rendering here
            return null;

          default:
            // Unknown type, return null
            console.warn(`Unknown interactive component type: ${(component as InteractiveComponent).type}`);
            return null;
        }
      })}
    </div>
  );
});

// Export all components
export { ButtonGroup } from './ButtonGroup';
export { ChoiceCard } from './ChoiceCard';
export { SummaryCard } from './SummaryCard';
export { ProgressCard } from './ProgressCard';
export { CodeBlock } from './CodeBlock';

export default InteractiveComponentRenderer;

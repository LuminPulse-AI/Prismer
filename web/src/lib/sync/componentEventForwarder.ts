/**
 * Component Event Forwarder
 *
 * Forwards component events to the Agent Server
 *
 * Usage:
 * 1. WorkspaceView calls setComponentEventForwarder to set the forwarder function
 * 2. Components call forwardComponentEvent to report events
 * 3. Events are sent to the Agent Server via WebSocket
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('EventForwarder');

type ComponentEventForwarder = (
  component: string,
  eventType: string,
  data?: unknown
) => void;

// Global forwarder function (set by WorkspaceView)
let globalForwarder: ComponentEventForwarder | null = null;

/**
 * Set the component event forwarder function
 * Called by the top-level component (WorkspaceView) on mount
 */
export function setComponentEventForwarder(forwarder: ComponentEventForwarder | null): void {
  globalForwarder = forwarder;
  if (forwarder) {
    log.info('Forwarder registered');
  } else {
    log.debug('Forwarder unregistered');
  }
}

/**
 * Forward a component event to the server
 * Called by components during lifecycle events such as ready/contentLoaded
 */
export function forwardComponentEvent(
  component: string,
  eventType: string,
  data?: unknown
): void {
  if (globalForwarder) {
    log.info('Forwarding component event', { component, eventType });
    globalForwarder(component, eventType, data);
  } else {
    log.debug('No forwarder, skipping event', { component, eventType });
  }
}

/**
 * Check if the forwarder has been set
 */
export function hasComponentEventForwarder(): boolean {
  return globalForwarder !== null;
}

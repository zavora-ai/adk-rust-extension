/**
 * MessageBus routes messages between the sidebar and Studio webviews
 * through the extension host.
 *
 * Messages from the sidebar are delivered to Studio, and vice versa.
 * When Studio is disconnected, sidebar→studio messages are queued and
 * delivered in order when Studio reconnects. Messages older than 30 seconds
 * are discarded from the queue.
 *
 * @module messageBus
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { getLogger } from './logger';
import type { BusMessage } from './types';

/** Maximum age (in milliseconds) for queued messages before they are discarded. */
const QUEUE_MAX_AGE_MS = 30_000;

/** Time (in milliseconds) to wait for an acknowledgment before logging a warning. */
const ACK_TIMEOUT_MS = 5_000;

/**
 * Minimal interface for the sidebar message target.
 *
 * The sidebar provider must implement this so the bus can deliver
 * studio→sidebar messages without depending on the full provider class.
 */
export interface SidebarMessageTarget {
  /** Sends a message to the sidebar webview. */
  postMessageToWebview(message: BusMessage): void;
}

/** A queued message with its enqueue timestamp. */
interface QueuedMessage {
  message: BusMessage;
  timestamp: number;
}

/**
 * Routes `BusMessage` instances between the sidebar webview and the
 * Studio webview panel through the extension host.
 *
 * @example
 * const bus = new MessageBus();
 * bus.registerSidebar(sidebarProvider);
 * bus.registerStudio(studioPanel);
 * bus.send({ type: 'focusProject', source: 'sidebar', payload: { projectId: '...' }, id: '' });
 */
export class MessageBus implements vscode.Disposable {
  private sidebar: SidebarMessageTarget | null = null;
  private studioPanel: vscode.WebviewPanel | null = null;
  private queue: QueuedMessage[] = [];
  private ackTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private studioDisposeListener: vscode.Disposable | null = null;

  /**
   * Registers the sidebar webview as a message endpoint.
   *
   * @param provider - The sidebar target that can receive messages
   */
  registerSidebar(provider: SidebarMessageTarget): void {
    this.sidebar = provider;
  }

  /**
   * Registers the Studio webview panel as a message endpoint.
   *
   * On registration, any queued sidebar→studio messages that are still
   * within the 30-second window are flushed to the panel in order.
   * An `onDidDispose` listener is attached so the panel is automatically
   * unregistered when the user closes it.
   *
   * @param panel - The Studio webview panel
   */
  registerStudio(panel: vscode.WebviewPanel): void {
    this.studioPanel = panel;

    // Auto-unregister when the panel is disposed
    this.studioDisposeListener = panel.onDidDispose(() => {
      this.unregisterStudio();
    });

    // Flush queued messages
    this.flushQueue();
  }

  /**
   * Unregisters the Studio webview panel.
   *
   * Clears the stored panel reference and dispose listener. Does not
   * dispose the panel itself — that is the caller's responsibility.
   */
  unregisterStudio(): void {
    this.studioPanel = null;
    if (this.studioDisposeListener) {
      this.studioDisposeListener.dispose();
      this.studioDisposeListener = null;
    }
  }

  /**
   * Sends a message from one surface to the other.
   *
   * - `source === 'sidebar'` → delivered to Studio (or queued if disconnected)
   * - `source === 'studio'`  → delivered to sidebar (discarded with warning if disconnected)
   *
   * A unique ID is generated via `crypto.randomUUID()` when the message
   * does not already carry one. After delivery, a 5-second acknowledgment
   * timer is started; if no `ack` is received the bus logs a warning.
   *
   * @param message - The message to route
   */
  send(message: BusMessage): void {
    // Ensure the message has a unique ID
    if (!message.id) {
      message.id = crypto.randomUUID();
    }

    // Handle ack messages — they clear pending timers, not routed further.
    // The ack payload should contain the original message ID, but fall back
    // to the ack message's own ID for backwards compatibility.
    if (message.type === 'ack') {
      const originalId =
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'messageId' in message.payload &&
        typeof (message.payload as Record<string, unknown>).messageId === 'string'
          ? (message.payload as Record<string, string>).messageId
          : message.id;
      this.handleAck(originalId);
      return;
    }

    if (message.source === 'sidebar') {
      this.deliverToStudio(message);
    } else if (message.source === 'studio') {
      this.deliverToSidebar(message);
    }
  }

  /**
   * Returns whether the Studio webview panel is currently registered.
   *
   * @returns `true` if a Studio panel is connected
   */
  isStudioConnected(): boolean {
    return this.studioPanel !== null;
  }

  /**
   * Disposes of the MessageBus, clearing all timers, the queue,
   * and unregistering both endpoints.
   */
  dispose(): void {
    // Clear all ack timers
    for (const timer of this.ackTimers.values()) {
      clearTimeout(timer);
    }
    this.ackTimers.clear();

    // Clear queue
    this.queue = [];

    // Unregister endpoints
    this.sidebar = null;
    this.unregisterStudio();
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Delivers a sidebar→studio message. If Studio is disconnected the
   * message is queued instead.
   */
  private deliverToStudio(message: BusMessage): void {
    if (this.studioPanel) {
      this.postToPanel(this.studioPanel, message);
      this.startAckTimer(message);
    } else {
      this.queue.push({ message, timestamp: Date.now() });
    }
  }

  /**
   * Delivers a studio→sidebar message. If the sidebar is not connected
   * the message is discarded with a warning.
   */
  private deliverToSidebar(message: BusMessage): void {
    if (this.sidebar) {
      this.sidebar.postMessageToWebview(message);
      this.startAckTimer(message);
    } else {
      const logger = getLogger();
      logger.warn(
        `MessageBus: discarding studio→sidebar message "${message.type}" — sidebar not connected`
      );
    }
  }

  /**
   * Posts a `BusMessage` to a webview panel, catching disposal errors.
   */
  private postToPanel(panel: vscode.WebviewPanel, message: BusMessage): void {
    try {
      panel.webview.postMessage(message);
    } catch (err: unknown) {
      const logger = getLogger();
      logger.warn(
        `MessageBus: failed to post message "${message.type}" to Studio — ${String(err)}`
      );
      this.unregisterStudio();
    }
  }

  /**
   * Flushes queued messages to the Studio panel, discarding any that
   * are older than 30 seconds.
   */
  private flushQueue(): void {
    if (!this.studioPanel) {
      return;
    }

    const now = Date.now();
    const validMessages = this.queue.filter(
      (entry) => now - entry.timestamp < QUEUE_MAX_AGE_MS
    );

    // Clear the queue before delivering to avoid re-entrancy issues
    this.queue = [];

    for (const entry of validMessages) {
      this.postToPanel(this.studioPanel, entry.message);
      this.startAckTimer(entry.message);
    }
  }

  /**
   * Starts a 5-second timer for acknowledgment. If no `ack` arrives
   * before the timer fires, a warning is logged.
   */
  private startAckTimer(message: BusMessage): void {
    const timer = setTimeout(() => {
      this.ackTimers.delete(message.id);
      const logger = getLogger();
      logger.warn(
        `MessageBus: no ack received for message "${message.type}" (id: ${message.id}) after ${ACK_TIMEOUT_MS / 1000}s`
      );
    }, ACK_TIMEOUT_MS);

    this.ackTimers.set(message.id, timer);
  }

  /**
   * Handles an incoming `ack` message by clearing the corresponding timer.
   */
  private handleAck(messageId: string): void {
    const timer = this.ackTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.ackTimers.delete(messageId);
    }
  }
}

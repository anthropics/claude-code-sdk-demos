// ccsdk/listeners-manager.ts
import { readdir, watch } from "fs/promises";
import { join } from "path";
import type {
  ListenerConfig,
  ListenerModule,
  ListenerContext,
  NotifyOptions,
  SubagentOptions,
  EventType
} from "../agent/custom_scripts/types";
import type { ImapManager } from "../database/imap-manager";
import type { DatabaseManager } from "../database/database-manager";

/**
 * Manages loading, watching, and executing listener scripts
 */
export class ListenersManager {
  private listenersDir = join(process.cwd(), "agent/custom_scripts/listeners");
  private listeners: Map<string, ListenerModule> = new Map();
  private notificationCallback?: (notification: any) => void;
  private watcherActive = false;
  private imapManager: ImapManager;
  private databaseManager: DatabaseManager;

  constructor(
    notificationCallback: ((notification: any) => void) | undefined,
    imapManager: ImapManager,
    databaseManager: DatabaseManager
  ) {
    this.notificationCallback = notificationCallback;
    this.imapManager = imapManager;
    this.databaseManager = databaseManager;
  }

  /**
   * Load all listener files from the listeners directory
   */
  async loadAllListeners(): Promise<ListenerConfig[]> {
    this.listeners.clear();

    try {
      const files = await readdir(this.listenersDir);

      for (const file of files) {
        // Skip non-TypeScript files and files starting with _ or .
        if (file.endsWith(".ts") && !file.startsWith("_") && !file.startsWith(".")) {
          await this.loadListener(file);
        }
      }

      console.log(`[ListenersManager] Loaded ${this.listeners.size} listener(s)`);
    } catch (error) {
      console.error("[ListenersManager] Error loading listeners:", error);
    }

    return Array.from(this.listeners.values()).map(l => l.config);
  }

  /**
   * Load a single listener file
   */
  private async loadListener(filename: string): Promise<void> {
    try {
      const filePath = join(this.listenersDir, filename);
      // Use cache busting to allow hot reload
      const module = await import(`${filePath}?t=${Date.now()}`);

      if (!module.config || !module.handler) {
        console.error(`[ListenersManager] Invalid listener ${filename}: missing config or handler`);
        return;
      }

      if (module.config.enabled) {
        this.listeners.set(module.config.id, {
          config: module.config,
          handler: module.handler
        });
        console.log(`[ListenersManager] ✓ Loaded listener: ${module.config.id} (${module.config.name})`);
      } else {
        console.log(`[ListenersManager] ✗ Skipped disabled listener: ${module.config.id}`);
      }
    } catch (error) {
      console.error(`[ListenersManager] Error loading listener ${filename}:`, error);
    }
  }

  /**
   * Create a context object for a listener execution
   * Context methods are currently stubs - will be implemented in next phase
   */
  private createContext(listenerConfig: ListenerConfig): ListenerContext {
    return {
      notify: async (message: string, options?: NotifyOptions) => {
        console.log(`[ListenerContext] STUB notify() called by ${listenerConfig.id}:`, {
          message,
          priority: options?.priority || "normal"
        });

        if (this.notificationCallback) {
          this.notificationCallback({
            type: "listener_notification",
            listenerId: listenerConfig.id,
            listenerName: listenerConfig.name,
            priority: options?.priority || "normal",
            message,
            timestamp: new Date().toISOString()
          });
        }
      },

      archiveEmail: async (emailId: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Archiving email ${emailId} (UID: ${email.imapUid})`);

          // Perform IMAP operation
          await this.imapManager.archiveEmail(email.imapUid, email.folder);

          // Update database
          this.databaseManager.updateEmailFlags(emailId, {
            folder: '[Gmail]/All Mail'
          });

          console.log(`[ListenerContext] ✓ Archived email ${emailId}`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to archive email ${emailId}:`, error);
          throw error;
        }
      },

      starEmail: async (emailId: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Starring email ${emailId} (UID: ${email.imapUid})`);

          await this.imapManager.starEmail(email.imapUid, email.folder);

          this.databaseManager.updateEmailFlags(emailId, {
            isStarred: true
          });

          console.log(`[ListenerContext] ✓ Starred email ${emailId}`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to star email ${emailId}:`, error);
          throw error;
        }
      },

      unstarEmail: async (emailId: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Unstarring email ${emailId} (UID: ${email.imapUid})`);

          await this.imapManager.unstarEmail(email.imapUid, email.folder);

          this.databaseManager.updateEmailFlags(emailId, {
            isStarred: false
          });

          console.log(`[ListenerContext] ✓ Unstarred email ${emailId}`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to unstar email ${emailId}:`, error);
          throw error;
        }
      },

      markAsRead: async (emailId: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Marking email ${emailId} as read (UID: ${email.imapUid})`);

          await this.imapManager.markAsRead(email.imapUid, email.folder);

          this.databaseManager.updateEmailFlags(emailId, {
            isRead: true
          });

          console.log(`[ListenerContext] ✓ Marked email ${emailId} as read`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to mark email ${emailId} as read:`, error);
          throw error;
        }
      },

      markAsUnread: async (emailId: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Marking email ${emailId} as unread (UID: ${email.imapUid})`);

          await this.imapManager.markAsUnread(email.imapUid, email.folder);

          this.databaseManager.updateEmailFlags(emailId, {
            isRead: false
          });

          console.log(`[ListenerContext] ✓ Marked email ${emailId} as unread`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to mark email ${emailId} as unread:`, error);
          throw error;
        }
      },

      addLabel: async (emailId: string, label: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Adding label "${label}" to email ${emailId} (UID: ${email.imapUid})`);

          await this.imapManager.addLabel(email.imapUid, label, email.folder);

          // Update database labels
          const currentLabels = email.labels || [];
          if (!currentLabels.includes(label)) {
            this.databaseManager.updateEmailFlags(emailId, {
              labels: [...currentLabels, label]
            });
          }

          console.log(`[ListenerContext] ✓ Added label "${label}" to email ${emailId}`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to add label "${label}" to email ${emailId}:`, error);
          throw error;
        }
      },

      removeLabel: async (emailId: string, label: string) => {
        try {
          const email = await this.databaseManager.getEmailByMessageId(emailId);
          if (!email) {
            throw new Error(`Email not found: ${emailId}`);
          }
          if (!email.imapUid) {
            throw new Error(`Email missing IMAP UID: ${emailId}`);
          }

          console.log(`[ListenerContext] Removing label "${label}" from email ${emailId} (UID: ${email.imapUid})`);

          await this.imapManager.removeLabel(email.imapUid, label, email.folder);

          // Update database labels
          const currentLabels = email.labels || [];
          this.databaseManager.updateEmailFlags(emailId, {
            labels: currentLabels.filter(l => l !== label)
          });

          console.log(`[ListenerContext] ✓ Removed label "${label}" from email ${emailId}`);
        } catch (error) {
          console.error(`[ListenerContext] Failed to remove label "${label}" from email ${emailId}:`, error);
          throw error;
        }
      },

      callAgent: async <T = any>(options: SubagentOptions<T>): Promise<T> => {
        console.log(`[ListenerContext] STUB callAgent() called by ${listenerConfig.id}:`, {
          model: options.model || "haiku",
          promptLength: options.prompt.length,
          schema: options.schema
        });
        // TODO: Implement Claude API call with structured output
        throw new Error("callAgent() not yet implemented");
      }
    };
  }

  /**
   * Check if an event matches any listeners and execute handlers
   */
  async checkEvent(event: EventType, data: any): Promise<void> {
    const matchingListeners = Array.from(this.listeners.values())
      .filter(listener => listener.config.event === event);

    if (matchingListeners.length === 0) {
      return;
    }

    console.log(`[ListenersManager] Triggering ${matchingListeners.length} listener(s) for event: ${event}`);

    for (const listener of matchingListeners) {
      try {
        const context = this.createContext(listener.config);
        await listener.handler(data, context);
        console.log(`[ListenersManager] ✓ ${listener.config.id} executed successfully`);
      } catch (error) {
        console.error(`[ListenersManager] ✗ ${listener.config.id} failed:`, error);
        // Continue with other listeners - don't let one failure break the batch
      }
    }
  }

  /**
   * Get all listener configs
   */
  getAllListeners(): ListenerConfig[] {
    return Array.from(this.listeners.values()).map(l => l.config);
  }

  /**
   * Get a specific listener by ID
   */
  getListener(id: string): ListenerModule | undefined {
    return this.listeners.get(id);
  }

  /**
   * Watch for file changes and reload listeners
   */
  async watchListeners(onChange: (listeners: ListenerConfig[]) => void): Promise<void> {
    if (this.watcherActive) {
      console.log("[ListenersManager] File watcher already active");
      return;
    }

    try {
      this.watcherActive = true;
      console.log(`[ListenersManager] Watching ${this.listenersDir} for changes...`);

      const watcher = watch(this.listenersDir);

      for await (const event of watcher) {
        console.log(`[ListenersManager] File ${event.eventType}: ${event.filename}`);

        if (event.filename?.endsWith(".ts")) {
          console.log("[ListenersManager] Reloading listeners...");
          const listeners = await this.loadAllListeners();
          onChange(listeners);
        }
      }
    } catch (error) {
      console.error("[ListenersManager] Error watching listeners:", error);
      this.watcherActive = false;
    }
  }

  /**
   * Get statistics about loaded listeners
   */
  getStats() {
    const listeners = Array.from(this.listeners.values());
    const byEvent = listeners.reduce((acc, listener) => {
      acc[listener.config.event] = (acc[listener.config.event] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.listeners.size,
      byEvent,
      enabled: listeners.filter(l => l.config.enabled).length
    };
  }
}

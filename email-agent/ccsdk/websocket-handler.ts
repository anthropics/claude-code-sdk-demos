import { Database } from "bun:sqlite";
import { Session } from "./session";
import type { WSClient, IncomingMessage, GenerateActionsMessage } from "./types";
import { DATABASE_PATH } from "../database/config";
import { watch } from "fs";
import { AIClient } from "./ai-client";
import { EMAIL_ACTIONS_PROMPT } from "./email-actions-prompt";

// Main WebSocket handler class
export class WebSocketHandler {
  private db: Database;
  private sessions: Map<string, Session> = new Map();
  private clients: Map<string, WSClient> = new Map();
  private profileWatcher: any = null;
  private profileContent: string = '';
  private profileUpdateTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath: string = DATABASE_PATH) {
    this.db = new Database(dbPath);
    this.initProfileWatcher();
    this.initEmailWatcher();
  }

  private async initProfileWatcher() {
    const profilePath = './agent/data/PROFILE.md';

    // Read initial content
    try {
      const file = Bun.file(profilePath);
      if (await file.exists()) {
        this.profileContent = await file.text();
      }
    } catch (error) {
      console.error('Error reading initial profile:', error);
    }

    // Watch for changes
    try {
      this.profileWatcher = watch(profilePath, async (eventType) => {
        if (eventType === 'change') {
          // Debounce updates
          if (this.profileUpdateTimeout) {
            clearTimeout(this.profileUpdateTimeout);
          }

          this.profileUpdateTimeout = setTimeout(async () => {
            try {
              const file = Bun.file(profilePath);
              const newContent = await file.text();

              if (newContent !== this.profileContent) {
                this.profileContent = newContent;
                this.broadcastProfileUpdate(newContent);
              }
            } catch (error) {
              console.error('Error reading profile update:', error);
            }
          }, 500); // 500ms debounce
        }
      });
    } catch (error) {
      console.error('Error setting up profile watcher:', error);
    }
  }

  private async initEmailWatcher() {
    // Poll for email updates every 5 seconds
    setInterval(() => {
      this.broadcastInboxUpdate();
    }, 5000);

    // Send initial inbox on first load
    this.broadcastInboxUpdate();
  }

  private async getRecentEmails(limit: number = 30) {
    try {
      const emails = this.db.prepare(`
        SELECT
          e.message_id as id,
          e.message_id,
          e.subject,
          e.from_address,
          e.from_name,
          e.date_sent,
          e.snippet,
          e.is_read,
          e.is_starred,
          e.has_attachments,
          e.folder,
          ea.actions_json,
          ea.generated_at as actions_generated_at
        FROM emails e
        LEFT JOIN email_actions ea ON e.message_id = ea.email_message_id AND ea.is_valid = 1
        ORDER BY e.date_sent DESC
        LIMIT ?
      `).all(limit);

      // Parse actions_json for each email that has cached actions
      const processedEmails = emails.map(email => ({
        ...email,
        actions: email.actions_json ? JSON.parse(email.actions_json) : null,
        actions_json: undefined, // Remove the raw JSON field
        actions_generated_at: email.actions_generated_at || undefined
      }));

      const emailsWithActions = processedEmails.filter(email => email.actions !== null);
      console.log('[GET_RECENT_EMAILS] Fetched', processedEmails.length, 'emails,', emailsWithActions.length, 'with cached actions');

      return processedEmails;
    } catch (error) {
      console.error('Error fetching recent emails:', error);
      return [];
    }
  }

  private async broadcastInboxUpdate() {
    const emails = await this.getRecentEmails();
    const emailsWithActions = emails.filter(email => email.actions !== null);
    console.log('[INBOX_UPDATE] Broadcasting inbox update with', emails.length, 'emails,', emailsWithActions.length, 'with actions');

    const message = JSON.stringify({
      type: 'inbox_update',
      emails
    });

    // Broadcast to all connected clients
    for (const client of this.clients.values()) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending inbox update to client:', error);
      }
    }
  }

  private broadcastProfileUpdate(content: string) {
    const message = JSON.stringify({
      type: 'profile_update',
      content
    });

    // Broadcast to all connected clients
    for (const client of this.clients.values()) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending profile update to client:', error);
      }
    }
  }

  private generateSessionId(): string {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(7);
  }

  private getOrCreateSession(sessionId?: string): Session {
    if (sessionId && this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const newSessionId = sessionId || this.generateSessionId();
    const session = new Session(newSessionId, this.db);
    this.sessions.set(newSessionId, session);
    return session;
  }

  public async onOpen(ws: WSClient) {
    const clientId = Date.now().toString() + '-' + Math.random().toString(36).substring(7);
    this.clients.set(clientId, ws);
    console.log('WebSocket client connected:', clientId);

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to email assistant',
      availableSessions: Array.from(this.sessions.keys())
    }));

    // Send initial profile content if available
    if (this.profileContent) {
      ws.send(JSON.stringify({
        type: 'profile_update',
        content: this.profileContent
      }));
    }

    // Send initial inbox
    const emails = await this.getRecentEmails();
    ws.send(JSON.stringify({
      type: 'inbox_update',
      emails
    }));
  }

  public async onMessage(ws: WSClient, message: string) {
    try {
      const data = JSON.parse(message) as IncomingMessage;

      switch (data.type) {
        case 'chat': {
          // Handle chat message
          const session = this.getOrCreateSession(data.sessionId);

          // Auto-subscribe the sender to the session
          if (!ws.data.sessionId || ws.data.sessionId !== session.id) {
            session.subscribe(ws);
          }

          // Check if this is a request to start a new conversation
          if (data.newConversation) {
            session.endConversation();
          }

          // Add the user message to the session
          await session.addUserMessage(data.content);
          break;
        }

        case 'subscribe': {
          // Subscribe to a specific session
          const session = this.sessions.get(data.sessionId);
          if (session) {
            // Unsubscribe from current session if any
            if (ws.data.sessionId && ws.data.sessionId !== data.sessionId) {
              const currentSession = this.sessions.get(ws.data.sessionId);
              currentSession?.unsubscribe(ws);
            }

            session.subscribe(ws);
            ws.send(JSON.stringify({
              type: 'subscribed',
              sessionId: data.sessionId
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Session not found'
            }));
          }
          break;
        }

        case 'unsubscribe': {
          // Unsubscribe from a session
          const session = this.sessions.get(data.sessionId);
          if (session) {
            session.unsubscribe(ws);
            ws.data.sessionId = '';
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              sessionId: data.sessionId
            }));
          }
          break;
        }

        case 'request_inbox': {
          // Send current inbox to requesting client
          const emails = await this.getRecentEmails();
          ws.send(JSON.stringify({
            type: 'inbox_update',
            emails
          }));
          break;
        }

        case 'generate_actions': {
          // Handle email actions generation
          await this.handleGenerateActions(ws, data);
          break;
        }

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type'
          }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  }

  public onClose(ws: WSClient) {
    // Unsubscribe from any session
    if (ws.data.sessionId) {
      const session = this.sessions.get(ws.data.sessionId);
      session?.unsubscribe(ws);
    }

    // Remove from clients map
    const clientsArray = Array.from(this.clients.entries());
    for (const [id, client] of clientsArray) {
      if (client === ws) {
        this.clients.delete(id);
        console.log('WebSocket client disconnected:', id);
        break;
      }
    }

    // Clean up empty sessions
    this.cleanupEmptySessions();
  }

  private async handleGenerateActions(ws: WSClient, data: GenerateActionsMessage) {
    const startTime = Date.now();
    console.log('[EMAIL_ACTIONS] Starting action generation for email:', data.emailId);

    try {
      // Send initial response indicating processing started
      ws.send(JSON.stringify({
        type: 'actions_generating',
        emailId: data.emailId,
        message: 'Analyzing email and generating actions...'
      }));

      console.log('[EMAIL_ACTIONS] Sent initial processing message to client');

      // Get email details if not provided
      let emailContent = data.emailContent;
      if (!emailContent && data.emailId) {
        console.log('[EMAIL_ACTIONS] Fetching email content from database for ID:', data.emailId);

        const emailRow = this.db.prepare(`
          SELECT
            message_id,
            subject,
            from_address,
            from_name,
            to_address,
            date_sent,
            body_text,
            body_html,
            snippet
          FROM emails
          WHERE message_id = ?
        `).get(data.emailId);

        if (emailRow) {
          emailContent = {
            subject: emailRow.subject || '',
            from_address: emailRow.from_address || '',
            from_name: emailRow.from_name || '',
            to_address: emailRow.to_address || '',
            date_sent: emailRow.date_sent || '',
            body_text: emailRow.body_text || emailRow.snippet || '',
            body_html: emailRow.body_html || ''
          };

          console.log('[EMAIL_ACTIONS] Successfully retrieved email content:', {
            subject: emailContent.subject,
            from: emailContent.from_address,
            bodyLength: (emailContent.body_text || '').length
          });
        } else {
          console.log('[EMAIL_ACTIONS] No email found in database for ID:', data.emailId);
        }
      } else {
        console.log('[EMAIL_ACTIONS] Using provided email content');
      }

      if (!emailContent) {
        console.log('[EMAIL_ACTIONS] Error: Email content not found or invalid');
        ws.send(JSON.stringify({
          type: 'actions_error',
          emailId: data.emailId,
          error: 'Email not found or invalid email data'
        }));
        return;
      }

      // Create AI client with email actions prompt
      console.log('[EMAIL_ACTIONS] Creating AI client for actions generation');
      const aiClient = new AIClient({
        appendSystemPrompt: EMAIL_ACTIONS_PROMPT,
        maxTurns: 50
      });

      // Construct prompt for the agent
      const prompt = `Please analyze this email and generate structured action recommendations.

Email Details:
- Subject: ${emailContent.subject}
- From: ${emailContent.from_name ? `${emailContent.from_name} <${emailContent.from_address}>` : emailContent.from_address}
- To: ${emailContent.to_address || 'Not specified'}
- Date: ${emailContent.date_sent}
- Body: ${emailContent.body_text || emailContent.body_html || 'No content available'}

Steps:
1. First, search for related emails using the inbox-searcher subagent to understand the context
2. Analyze the email content and any related emails found
3. Generate structured action recommendations as a JSON object

Return your response as a valid JSON object with the structure specified in your instructions.`;

      console.log('[EMAIL_ACTIONS] Sending prompt to AI client, email subject:', emailContent.subject);

      // Query the AI agent
      const aiQueryStartTime = Date.now();
      const result = await aiClient.querySingle(prompt);
      const aiQueryDuration = Date.now() - aiQueryStartTime;

      console.log('[EMAIL_ACTIONS] AI client responded in', aiQueryDuration, 'ms with cost:', result.cost);

      // Extract the final assistant message that should contain the JSON
      console.log('[EMAIL_ACTIONS] Processing AI response, message count:', result.messages.length);
      let actionsJson = null;
      let lastAssistantMessage = '';

      for (const message of result.messages) {
        if (message.type === 'assistant' && message.message.content) {
          if (typeof message.message.content === 'string') {
            lastAssistantMessage = message.message.content;
          } else if (Array.isArray(message.message.content)) {
            for (const block of message.message.content) {
              if (block.type === 'text') {
                lastAssistantMessage += block.text;
              }
            }
          }
        }
      }

      console.log('[EMAIL_ACTIONS] Extracted assistant message length:', lastAssistantMessage.length);

      // Try to extract JSON from the response
      const jsonMatch = lastAssistantMessage.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        console.log('[EMAIL_ACTIONS] Found JSON code block, attempting to parse');
        try {
          actionsJson = JSON.parse(jsonMatch[1]);
          console.log('[EMAIL_ACTIONS] Successfully parsed JSON from code block, action count:', actionsJson.actions?.length || 0);
        } catch (parseError) {
          console.error('[EMAIL_ACTIONS] Failed to parse actions JSON from code block:', parseError);
        }
      }

      // If no JSON block found, try to parse the entire message as JSON
      if (!actionsJson) {
        console.log('[EMAIL_ACTIONS] No JSON code block found, trying to parse entire message as JSON');
        try {
          actionsJson = JSON.parse(lastAssistantMessage.trim());
          console.log('[EMAIL_ACTIONS] Successfully parsed entire message as JSON, action count:', actionsJson.actions?.length || 0);
        } catch (parseError) {
          console.error('[EMAIL_ACTIONS] Failed to parse entire message as JSON:', parseError);
        }
      }

      if (!actionsJson) {
        console.log('[EMAIL_ACTIONS] Warning: Could not extract valid JSON from AI response');
      }

      // Store the generated actions in the database if valid
      if (actionsJson && actionsJson.actions) {
        try {
          console.log('[EMAIL_ACTIONS] Storing actions in database for email:', data.emailId);

          // First, invalidate any existing actions for this email
          this.db.prepare(`
            UPDATE email_actions
            SET is_valid = 0
            WHERE email_message_id = ?
          `).run(data.emailId);

          // Insert the new actions
          this.db.prepare(`
            INSERT INTO email_actions (email_message_id, actions_json)
            VALUES (?, ?)
          `).run(data.emailId, JSON.stringify(actionsJson));

          console.log('[EMAIL_ACTIONS] Successfully stored actions in database');
        } catch (dbError) {
          console.error('[EMAIL_ACTIONS] Error storing actions in database:', dbError);
          // Continue with response even if DB storage fails
        }
      }

      // Send the result back to the client
      const totalDuration = Date.now() - startTime;

      console.log('[EMAIL_ACTIONS] Sending response to client:', {
        emailId: data.emailId,
        hasActions: !!actionsJson,
        actionsCount: actionsJson?.actions?.length || 0,
        totalDuration: totalDuration,
        cost: result.cost
      });

      ws.send(JSON.stringify({
        type: 'actions_generated',
        emailId: data.emailId,
        actions: actionsJson,
        rawResponse: lastAssistantMessage,
        cost: result.cost,
        duration: result.duration
      }));

      // Broadcast updated inbox to all clients so they see the new actions
      this.broadcastInboxUpdate();

      console.log('[EMAIL_ACTIONS] Completed action generation for email:', data.emailId, 'in', totalDuration, 'ms');

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error('[EMAIL_ACTIONS] Error generating email actions for', data.emailId, 'after', totalDuration, 'ms:', error);

      ws.send(JSON.stringify({
        type: 'actions_error',
        emailId: data.emailId,
        error: 'Failed to generate actions: ' + (error as Error).message
      }));
    }
  }

  private cleanupEmptySessions() {
    for (const [id, session] of this.sessions) {
      if (!session.hasSubscribers()) {
        // Keep session for a grace period (could be made configurable)
        setTimeout(() => {
          if (!session.hasSubscribers()) {
            session.cleanup();
            this.sessions.delete(id);
            console.log('Cleaned up empty session:', id);
          }
        }, 60000); // 1 minute grace period
      }
    }
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  public cleanup() {
    // Clean up profile watcher
    if (this.profileWatcher) {
      this.profileWatcher.close();
    }

    if (this.profileUpdateTimeout) {
      clearTimeout(this.profileUpdateTimeout);
    }

    // Clean up sessions
    for (const session of this.sessions.values()) {
      session.cleanup();
    }
  }
}
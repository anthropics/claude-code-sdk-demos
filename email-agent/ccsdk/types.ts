import type { ServerWebSocket } from "bun";
import type { SDKUserMessage, SDKMessage } from "@anthropic-ai/claude-code";

// WebSocket client type
export type WSClient = ServerWebSocket<{ sessionId: string }>;

// Message types for WebSocket communication
export interface ChatMessage {
  type: "chat";
  content: string;
  sessionId?: string;
  newConversation?: boolean;
}

export interface SubscribeMessage {
  type: "subscribe";
  sessionId: string;
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  sessionId: string;
}

export interface RequestInboxMessage {
  type: "request_inbox";
}

export interface GenerateActionsMessage {
  type: "generate_actions";
  emailId: string;
  emailContent?: {
    subject: string;
    from_address: string;
    from_name?: string;
    to_address?: string;
    date_sent: string;
    body_text?: string;
    body_html?: string;
  };
}

export type IncomingMessage = ChatMessage | SubscribeMessage | UnsubscribeMessage | RequestInboxMessage | GenerateActionsMessage;

// Re-export SDK types for convenience
export type { SDKUserMessage, SDKMessage };
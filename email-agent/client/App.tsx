import React, { useState, useEffect } from "react";
import { ChatInterface } from "./components/ChatInterface";
import { InboxView } from "./components/InboxView";
import { EmailViewer } from "./components/EmailViewer";
import { useWebSocket } from "./hooks/useWebSocket";
import { ScreenshotModeProvider } from "./context/ScreenshotModeContext";

const App: React.FC = () => {
  const [emails, setEmails] = useState([]);
  const [profileContent, setProfileContent] = useState('');
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [actionsLoading, setActionsLoading] = useState<{[key: string]: boolean}>({});

  // Single WebSocket connection for all components
  const { isConnected, sendMessage } = useWebSocket({
    url: 'ws://localhost:3000/ws',
    onMessage: (message) => {
      switch (message.type) {
        case 'inbox_update':
          const newEmails = message.emails || [];
          const emailsWithActions = newEmails.filter(email => email.actions !== null);
          console.log('[FRONTEND] Received inbox update with', newEmails.length, 'emails,', emailsWithActions.length, 'with actions');

          if (emailsWithActions.length > 0) {
            console.log('[FRONTEND] First email with actions:', emailsWithActions[0].subject, emailsWithActions[0].actions);
          }

          setEmails(newEmails);

          // Update selected email if it exists in the new email list
          if (selectedEmail) {
            const updatedSelectedEmail = newEmails.find(email => email.message_id === selectedEmail.message_id);
            if (updatedSelectedEmail) {
              console.log('[FRONTEND] Updating selected email, actions:', updatedSelectedEmail.actions !== null ? 'present' : 'absent');
              setSelectedEmail(updatedSelectedEmail);
            }
          }
          break;
        case 'profile_update':
          setProfileContent(message.content || '');
          break;
        case 'connected':
          console.log('Connected to server:', message.message);
          break;
        case 'session':
        case 'session_info':
          setSessionId(message.sessionId);
          break;
        case 'assistant_message':
          const assistantMsg = {
            id: Date.now().toString() + '-assistant',
            type: 'assistant',
            content: [{ type: 'text', text: message.content }],
            timestamp: new Date().toISOString(),
          };
          setMessages(prev => [...prev, assistantMsg]);
          setIsLoading(false);
          break;
        case 'tool_use':
          const toolMsg = {
            id: Date.now().toString() + '-tool',
            type: 'assistant',
            content: [{
              type: 'tool_use',
              id: message.toolId || Date.now().toString(),
              name: message.toolName,
              input: message.toolInput || {}
            }],
            timestamp: new Date().toISOString(),
          };
          setMessages(prev => [...prev, toolMsg]);
          break;
        case 'result':
          if (message.success) {
            console.log('Query completed successfully', message);
          } else {
            console.error('Query failed:', message.error);
          }
          setIsLoading(false);
          break;
        case 'actions_generating':
          console.log('Generating actions for email:', message.emailId);
          setActionsLoading(prev => ({...prev, [message.emailId]: true}));
          break;
        case 'actions_generated':
          console.log('Actions generated for email:', message.emailId);
          console.log('Generated Actions JSON:', message.actions);
          console.log('Raw response:', message.rawResponse);
          console.log('Cost:', message.cost, 'Duration:', message.duration);
          setActionsLoading(prev => ({...prev, [message.emailId]: false}));
          // Actions will be included in the updated inbox broadcast, no need to manage state here
          break;
        case 'actions_error':
          console.error('Actions generation error:', message.error);
          setActionsLoading(prev => ({...prev, [message.emailId]: false}));
          break;
        case 'error':
          console.error('Server error:', message.error);
          const errorMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: [{ type: 'text', text: `Error: ${message.error}` }],
            timestamp: new Date().toISOString(),
          };
          setMessages(prev => [...prev, errorMessage]);
          setIsLoading(false);
          break;
      }
    },
  });

  return (
    <ScreenshotModeProvider>
      <div className="flex h-screen bg-white">
        <InboxView
          emails={emails}
          profileContent={profileContent}
          onEmailSelect={setSelectedEmail}
          selectedEmailId={selectedEmail?.id}
        />
        <EmailViewer
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          sendMessage={sendMessage}
          actions={selectedEmail?.actions || null}
          isGeneratingActions={selectedEmail ? actionsLoading[selectedEmail.message_id] || false : false}
        />
        <div className="flex-1">
          <ChatInterface
            isConnected={isConnected}
            sendMessage={sendMessage}
            messages={messages}
            setMessages={setMessages}
            sessionId={sessionId}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        </div>
      </div>
    </ScreenshotModeProvider>
  );
};

export default App;

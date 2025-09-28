import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Inbox, User, Mail, Clock, Camera, CameraOff, Zap } from 'lucide-react';
import { useScreenshotMode } from '../context/ScreenshotModeContext';
import {
  getPlaceholderEmail,
  getPlaceholderName,
  getPlaceholderSubject,
  getPlaceholderSnippet,
  getPlaceholderDate
} from '../utils/placeholders';

interface Email {
  id: number;
  message_id: string;
  subject: string;
  from_address: string;
  from_name?: string;
  date_sent: string;
  snippet?: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  folder?: string;
  actions?: any;
}

interface InboxViewProps {
  emails: Email[];
  profileContent: string;
  onEmailSelect: (email: Email) => void;
  selectedEmailId?: number;
}

export function InboxView({ emails, profileContent, onEmailSelect, selectedEmailId }: InboxViewProps) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'profile'>('inbox');
  const { isScreenshotMode, toggleScreenshotMode } = useScreenshotMode();

  // Sort emails to show those with actions first
  const sortedEmails = [...emails].sort((a, b) => {
    const aHasActions = a.actions !== null && a.actions !== undefined;
    const bHasActions = b.actions !== null && b.actions !== undefined;

    // If action status differs, prioritize emails with actions
    if (aHasActions && !bHasActions) return -1;
    if (!aHasActions && bHasActions) return 1;

    // If action status is the same, sort by date (most recent first)
    return new Date(b.date_sent).getTime() - new Date(a.date_sent).getTime();
  });

  // Format date to relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Truncate text to specified length
  const truncate = (text: string | undefined, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="w-[400px] h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Tab Header */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex-1 px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors ${
            activeTab === 'inbox'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Inbox className="w-4 h-4" />
            <span>Inbox</span>
            {emails.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 rounded">
                {emails.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors ${
            activeTab === 'profile'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <User className="w-4 h-4" />
            <span>Profile</span>
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'inbox' ? (
          <div className="divide-y divide-gray-100">
            {emails.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No emails in inbox</p>
                <p className="text-xs mt-2">Emails will appear here once synced</p>
              </div>
            ) : (
              sortedEmails.map((email, index) => (
                <div
                  key={email.id}
                  onClick={() => onEmailSelect(email)}
                  className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                    !email.is_read ? 'bg-blue-50/30' : ''
                  } ${
                    selectedEmailId === email.id ? 'bg-gray-100 border-l-2 border-gray-900' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${!email.is_read ? 'font-semibold' : ''}`}>
                          {isScreenshotMode
                            ? getPlaceholderName(index)
                            : (email.from_name || email.from_address.split('@')[0])}
                        </span>
                        {!email.is_read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {isScreenshotMode
                          ? getPlaceholderEmail(index)
                          : email.from_address}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {isScreenshotMode
                        ? getPlaceholderDate(index * 3)
                        : formatRelativeTime(email.date_sent)}
                    </span>
                  </div>

                  <div className={`text-sm mb-1 ${!email.is_read ? 'font-medium' : ''}`}>
                    {isScreenshotMode
                      ? getPlaceholderSubject(index)
                      : truncate(email.subject || '(No subject)', 50)}
                  </div>

                  {email.snippet && (
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {isScreenshotMode
                        ? getPlaceholderSnippet(index)
                        : email.snippet}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    {email.actions && (
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">Actions</span>
                      </div>
                    )}
                    {email.is_starred && (
                      <span className="text-yellow-500 text-xs">★</span>
                    )}
                    {email.has_attachments && (
                      <span className="text-xs text-gray-400">📎</span>
                    )}
                    {email.folder && email.folder !== 'INBOX' && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {email.folder}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="p-4">
            {profileContent ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold mb-3 text-gray-900">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold mb-2 mt-4 text-gray-800">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-medium mb-1 mt-3 text-gray-700">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-gray-600 mb-2 leading-relaxed">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1 mb-3">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1 mb-3">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-gray-600">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-gray-700">{children}</em>
                    ),
                    code: ({ children }) => (
                      <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-800">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="bg-gray-100 p-3 rounded overflow-x-auto mb-3">
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-3">
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        {children}
                      </a>
                    ),
                    hr: () => <hr className="my-4 border-gray-200" />,
                  }}
                >
                  {profileContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center text-gray-400 mt-8">
                <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No profile information available</p>
                <p className="text-xs mt-2">Edit agent/data/PROFILE.md to add your profile</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {activeTab === 'inbox'
              ? `${emails.length} recent emails`
              : 'Live profile updates'
            }
          </p>
          <button
            onClick={toggleScreenshotMode}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-all"
            title={isScreenshotMode ? 'Disable Screenshot Mode' : 'Enable Screenshot Mode'}
          >
            {isScreenshotMode ? (
              <Camera className="w-3 h-3" />
            ) : (
              <CameraOff className="w-3 h-3" />
            )}
            <span>Screenshot mode</span>
          </button>
        </div>
      </div>
    </div>
  );
}
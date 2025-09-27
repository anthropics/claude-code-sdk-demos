import React, { useState } from 'react';
import {
  Reply,
  Forward,
  Plus,
  ExternalLink,
  Tag,
  Clock,
  Calendar,
  Archive,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Info,
  Minus
} from 'lucide-react';

interface EmailAction {
  type: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  data?: any;
}

interface EmailActionsContext {
  related_emails_found?: number;
  primary_topic?: string;
  urgency_level?: string;
  key_people?: string[];
  deadlines?: string[];
  urls_found?: string[];
}

interface EmailActionsData {
  actions: EmailAction[];
  context?: EmailActionsContext;
  error?: string;
}

interface EmailActionsProps {
  actions: EmailActionsData | null;
  onActionClick?: (action: EmailAction) => void;
}

const actionIconMap: Record<string, React.ComponentType<any>> = {
  draft_response: Reply,
  forward_email: Forward,
  new_email: Plus,
  open_url: ExternalLink,
  label_email: Tag,
  set_reminder: Clock,
  schedule_meeting: Calendar,
  archive_email: Archive,
  delete_email: Trash2,
};

const priorityConfig = {
  high: {
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200 hover:bg-red-100',
    icon: AlertCircle,
  },
  medium: {
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
    icon: Info,
  },
  low: {
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200 hover:bg-gray-100',
    icon: Minus,
  },
};

export function EmailActions({ actions, onActionClick }: EmailActionsProps) {
  const [expandedActions, setExpandedActions] = useState<Set<number>>(new Set());
  const [showContext, setShowContext] = useState(false);

  if (!actions) {
    return null;
  }

  if (actions.error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
        <p className="text-sm text-red-800">Error: {actions.error}</p>
      </div>
    );
  }

  if (!actions.actions || actions.actions.length === 0) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-sm text-gray-600">No actions suggested for this email.</p>
      </div>
    );
  }

  const toggleActionExpanded = (index: number) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedActions(newExpanded);
  };

  const handleActionClick = (action: EmailAction) => {
    if (onActionClick) {
      onActionClick(action);
    }
    // TODO: Implement specific action handlers
    console.log('Action clicked:', action);
  };

  const groupedActions = actions.actions.reduce((groups, action) => {
    const priority = action.priority || 'medium';
    if (!groups[priority]) {
      groups[priority] = [];
    }
    groups[priority].push(action);
    return groups;
  }, {} as Record<string, EmailAction[]>);

  const renderActionGroup = (priority: 'high' | 'medium' | 'low', actionsInGroup: EmailAction[]) => {
    const config = priorityConfig[priority];
    const PriorityIcon = config.icon;

    return (
      <div key={priority} className="mb-4">
        <div className="flex items-center mb-2">
          <PriorityIcon className={`w-4 h-4 mr-2 ${config.color}`} />
          <h5 className={`text-sm font-medium capitalize ${config.color}`}>
            {priority} Priority ({actionsInGroup.length})
          </h5>
        </div>
        <div className="space-y-2">
          {actionsInGroup.map((action, actionIndex) => {
            const globalIndex = actions.actions.indexOf(action);
            const isExpanded = expandedActions.has(globalIndex);
            const ActionIcon = actionIconMap[action.type] || Info;

            return (
              <div
                key={globalIndex}
                className={`border rounded-lg p-3 transition-colors ${config.bg}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start flex-1">
                    <ActionIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500" />
                    <div className="flex-1">
                      <button
                        onClick={() => handleActionClick(action)}
                        className="text-left font-medium text-sm text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {action.title}
                      </button>
                      <p className="text-xs text-gray-600 mt-1">
                        {action.description}
                      </p>

                      {isExpanded && action.data && (
                        <div className="mt-3 p-2 bg-white rounded border text-xs">
                          <div className="font-medium text-gray-700 mb-1">Action Details:</div>
                          {action.type === 'draft_response' && action.data.suggested_content && (
                            <div className="space-y-1">
                              <div><span className="font-medium">To:</span> {action.data.to}</div>
                              <div><span className="font-medium">Suggested content:</span></div>
                              <div className="bg-gray-50 p-2 rounded text-gray-700 whitespace-pre-wrap">
                                {action.data.suggested_content}
                              </div>
                            </div>
                          )}
                          {action.type === 'forward_email' && action.data.to && (
                            <div className="space-y-1">
                              <div><span className="font-medium">Forward to:</span> {Array.isArray(action.data.to) ? action.data.to.join(', ') : action.data.to}</div>
                              {action.data.note && <div><span className="font-medium">Note:</span> {action.data.note}</div>}
                            </div>
                          )}
                          {action.type === 'open_url' && action.data.url && (
                            <div className="space-y-1">
                              <div><span className="font-medium">URL:</span>
                                <a href={action.data.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                                  {action.data.url}
                                </a>
                              </div>
                              {action.data.reason && <div><span className="font-medium">Reason:</span> {action.data.reason}</div>}
                            </div>
                          )}
                          {action.type === 'set_reminder' && action.data.datetime && (
                            <div className="space-y-1">
                              <div><span className="font-medium">Date/Time:</span> {new Date(action.data.datetime).toLocaleString()}</div>
                              {action.data.message && <div><span className="font-medium">Message:</span> {action.data.message}</div>}
                            </div>
                          )}
                          {action.type === 'label_email' && action.data.labels && (
                            <div>
                              <span className="font-medium">Labels:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {action.data.labels.map((label: string, i: number) => (
                                  <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {!['draft_response', 'forward_email', 'open_url', 'set_reminder', 'label_email'].includes(action.type) && (
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                              {JSON.stringify(action.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {action.data && (
                    <button
                      onClick={() => toggleActionExpanded(globalIndex)}
                      className="ml-2 p-1 hover:bg-white rounded transition-colors"
                      title={isExpanded ? "Hide details" : "Show details"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Actions grouped by priority */}
      {['high', 'medium', 'low'].map(priority => {
        const actionsInGroup = groupedActions[priority];
        if (!actionsInGroup || actionsInGroup.length === 0) return null;
        return renderActionGroup(priority as 'high' | 'medium' | 'low', actionsInGroup);
      })}

      {/* Context section */}
      {actions.context && (
        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={() => setShowContext(!showContext)}
            className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Context Information
            {showContext ? (
              <ChevronUp className="w-4 h-4 ml-1" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1" />
            )}
          </button>

          {showContext && (
            <div className="mt-2 p-3 bg-gray-50 rounded-md text-xs text-gray-600 space-y-1">
              {actions.context.primary_topic && (
                <div><span className="font-medium">Topic:</span> {actions.context.primary_topic}</div>
              )}
              {actions.context.urgency_level && (
                <div><span className="font-medium">Urgency:</span> {actions.context.urgency_level}</div>
              )}
              {typeof actions.context.related_emails_found === 'number' && (
                <div><span className="font-medium">Related emails found:</span> {actions.context.related_emails_found}</div>
              )}
              {actions.context.key_people && actions.context.key_people.length > 0 && (
                <div><span className="font-medium">Key people:</span> {actions.context.key_people.join(', ')}</div>
              )}
              {actions.context.deadlines && actions.context.deadlines.length > 0 && (
                <div><span className="font-medium">Deadlines:</span> {actions.context.deadlines.join(', ')}</div>
              )}
              {actions.context.urls_found && actions.context.urls_found.length > 0 && (
                <div><span className="font-medium">URLs found:</span> {actions.context.urls_found.length}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
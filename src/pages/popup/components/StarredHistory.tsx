import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { StarredMessagesService } from '@/pages/content/timeline/StarredMessagesService';
import type { StarredMessage } from '@/pages/content/timeline/starredTypes';

interface StarredHistoryProps {
  onClose: () => void;
}

export function StarredHistory({ onClose }: StarredHistoryProps) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<StarredMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStarredMessages();
  }, []);

  const loadStarredMessages = async () => {
    setLoading(true);
    try {
      const allMessages = await StarredMessagesService.getAllStarredMessagesSorted();
      setMessages(allMessages);
    } catch (error) {
      console.error('Failed to load starred messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMessageClick = async (message: StarredMessage) => {
    // Check if we're already on a Gemini page
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetUrl = `${message.conversationUrl}#gv-turn-${message.turnId}`;

    const isGeminiPage = currentTab?.url?.includes('gemini.google.com') ||
                         currentTab?.url?.includes('aistudio.google.com');

    if (isGeminiPage && currentTab?.id) {
      // Navigate in the same tab (SPA navigation)
      await chrome.tabs.update(currentTab.id, { url: targetUrl });
      // Close the popup
      window.close();
    } else {
      // Open in new tab if not on Gemini
      await chrome.tabs.create({ url: targetUrl });
    }
  };

  const handleDeleteMessage = async (message: StarredMessage, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await StarredMessagesService.removeStarredMessage(
        message.conversationId,
        message.turnId
      );
      // Reload messages
      await loadStarredMessages();
    } catch (error) {
      console.error('Failed to delete starred message:', error);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Within 24 hours: show hours
    if (diffHours < 24) {
      if (diffHours === 0) {
        return t('justNow');
      }
      return `${diffHours} ${t('hoursAgo')}`;
    } else if (diffDays === 1) {
      return t('yesterday');
    } else if (diffDays < 7) {
      return `${diffDays} ${t('daysAgo')}`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div className="w-[360px] h-[600px] bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="bg-linear-to-br from-primary/10 via-accent/5 to-transparent border-b border-border/50 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            {t('starredHistory')}
          </h1>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-primary/10"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">{t('loading')}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-muted-foreground"
            >
              <path
                d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                fill="currentColor"
                opacity="0.3"
              />
            </svg>
            <p className="text-muted-foreground text-sm">{t('noStarredMessages')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <Card
                key={`${message.conversationId}-${message.turnId}`}
                className="p-3 hover:shadow-md transition-all cursor-pointer group relative"
                onClick={() => handleMessageClick(message)}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteMessage(message, e)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded-full"
                  title={t('removeFromStarred')}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-destructive"
                  >
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                {/* Message content */}
                <div className="pr-6">
                  <div className="flex items-start gap-2 mb-1">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-primary shrink-0 mt-0.5"
                    >
                      <path
                        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                        fill="currentColor"
                      />
                    </svg>
                    <p className="text-sm font-medium line-clamp-2">
                      {truncateText(message.content, 100)}
                    </p>
                  </div>

                  {/* Conversation info */}
                  <div className="ml-6 space-y-1">
                    {message.conversationTitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {message.conversationTitle}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(message.starredAt)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

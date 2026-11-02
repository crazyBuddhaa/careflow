'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { PortalChatbotConfig, PortalGuidedNode, PortalGuidedOption } from '@careflow/shared';
import { getDefaultUltimateTechAppConfig } from '@/config/business-portals';

export type SupportTopicId = 'deposit' | 'product' | 'account' | 'other' | 'human';

export type DemoOption = PortalGuidedOption;

export interface ChatTurn {
  id: string;
  sender: 'assistant' | 'customer';
  text: string;
}

const DEFAULT_CHATBOT_CONFIG = getDefaultUltimateTechAppConfig().chatbot;

export const INITIAL_GREETING = DEFAULT_CHATBOT_CONFIG.initialGreeting;
export const ROOT_OPTIONS: DemoOption[] = DEFAULT_CHATBOT_CONFIG.nodes.root?.options ?? [];

export interface GuidedSupportPreviewProps {
  turns: ChatTurn[];
  currentNodeId: string;
  onSelectOption: (label: string, nextNodeId: string) => void;
  onReset: () => void;
  highlighted?: boolean;
  chatbotConfig?: PortalChatbotConfig;
}

export function GuidedSupportPreview({
  turns,
  currentNodeId,
  onSelectOption,
  onReset,
  highlighted = false,
  chatbotConfig = DEFAULT_CHATBOT_CONFIG,
}: GuidedSupportPreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fallbackRoot: PortalGuidedNode = chatbotConfig.nodes.root ?? {
    id: 'root',
    reply: chatbotConfig.initialGreeting,
    options: [],
  };
  const currentNode = chatbotConfig.nodes[currentNodeId] ?? fallbackRoot;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [turns.length, currentNodeId]);

  return (
    <div
      className={`w-full rounded-2xl bg-white border transition-colors duration-200 shadow-sm overflow-hidden flex flex-col ${
        highlighted ? 'border-blue-600 ring-4 ring-blue-600/10' : 'border-slate-200/90'
      }`}
      aria-label={`Interactive ${chatbotConfig.assistantName} guided support preview`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50/70">
        <div>
          <p className="text-sm font-bold text-slate-900 tracking-tight">
            {chatbotConfig.assistantName}
          </p>
          <p className="text-xs text-slate-500">{chatbotConfig.assistantSubtitle}</p>
        </div>

        {turns.length > 1 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Start Over</span>
          </button>
        )}
      </div>

      {/* Conversation Transcript */}
      <div
        ref={scrollContainerRef}
        role="log"
        aria-live="polite"
        className="px-5 py-5 space-y-3.5 min-h-[250px] max-h-[340px] overflow-y-auto bg-gradient-to-b from-white to-slate-50/50"
      >
        <AnimatePresence initial={false}>
          {turns.map((turn) => {
            const isAssistant = turn.sender === 'assistant';
            return (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isAssistant
                      ? 'bg-slate-100 text-slate-900 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}
                >
                  {turn.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Interactive Options Tray */}
      <div className="px-5 py-4 border-t border-slate-100 bg-white">
        {currentNode.options.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 mb-2.5">
              Select an option to continue:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {currentNode.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectOption(option.label, option.nextNodeId)}
                  className="group w-full flex items-center justify-between gap-3 text-left px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-600 hover:bg-blue-50/40 text-sm font-semibold text-slate-800 hover:text-blue-700 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <span>{option.label}</span>
                  <ArrowRight
                    className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-transform duration-150 shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
              <span>Guided preview complete</span>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Explore Another Topic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function getReplyForNode(
  nodeId: string,
  chatbotConfig: PortalChatbotConfig = DEFAULT_CHATBOT_CONFIG
): string {
  return (chatbotConfig.nodes[nodeId] ?? chatbotConfig.nodes.root)?.reply ?? chatbotConfig.initialGreeting;
}

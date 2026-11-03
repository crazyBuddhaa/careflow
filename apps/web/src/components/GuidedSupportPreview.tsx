'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import type {
  ApiResponse,
  PortalAssistantResponseDto,
  PortalChatbotConfig,
  PortalGuidedNode,
  PortalGuidedOption,
} from '@careflow/shared';
import { getDefaultUltimateTechAppConfig } from '@/config/business-portals';

export type SupportTopicId = 'deposit' | 'product' | 'account' | 'other' | 'human';

export type DemoOption = PortalGuidedOption;

export interface ChatTurn {
  id: string;
  sender: 'assistant' | 'customer';
  text: string;
  sourceLabel?: string;
  suggestEscalation?: boolean;
}

const DEFAULT_CHATBOT_CONFIG = getDefaultUltimateTechAppConfig().chatbot;

export const INITIAL_GREETING = DEFAULT_CHATBOT_CONFIG.initialGreeting;
export const ROOT_OPTIONS: DemoOption[] = DEFAULT_CHATBOT_CONFIG.nodes.root?.options ?? [];

export interface GuidedSupportPreviewProps {
  turns: ChatTurn[];
  currentNodeId: string;
  onSelectOption: (label: string, nextNodeId: string) => void;
  onReset: () => void;
  onAppendTurns?: (newTurns: ChatTurn[]) => void;
  onRequestEscalation?: (suggestedTopic?: string) => void;
  businessSlug?: string;
  highlighted?: boolean;
  chatbotConfig?: PortalChatbotConfig;
}

export function GuidedSupportPreview({
  turns,
  currentNodeId,
  onSelectOption,
  onReset,
  onAppendTurns,
  onRequestEscalation,
  businessSlug = 'ultimatetechapp',
  highlighted = false,
  chatbotConfig = DEFAULT_CHATBOT_CONFIG,
}: GuidedSupportPreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);

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

  async function handleAskNaturalLanguage(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || asking || !onAppendTurns) return;

    setAsking(true);
    setQuestionInput('');
    const stamp = Date.now().toString();

    onAppendTurns([{ id: `cust-nl-${stamp}`, sender: 'customer', text: trimmed }]);

    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(businessSlug)}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      const body = (await res.json()) as ApiResponse<PortalAssistantResponseDto>;
      if (body.ok) {
        const layerLabelMap: Record<PortalAssistantResponseDto['resolutionLayer'], string> = {
          'boundary-guard': 'Support Scope',
          'business-rules': 'Verified FAQ',
          'knowledge-base': 'Help Center',
          'guided-troubleshooting': 'Guided Check',
          'ai-fallback': 'CustomCare Assistant',
          'human-escalation': 'Specialist Support',
        };
        const sourceText = body.data.matchedSourceTitle
          ? `${layerLabelMap[body.data.resolutionLayer]} · ${body.data.matchedSourceTitle}`
          : layerLabelMap[body.data.resolutionLayer];

        onAppendTurns([
          {
            id: `asst-nl-${stamp}`,
            sender: 'assistant',
            text: body.data.reply,
            sourceLabel: sourceText,
            suggestEscalation: body.data.suggestEscalation,
          },
        ]);
      } else {
        onAppendTurns([
          {
            id: `asst-err-${stamp}`,
            sender: 'assistant',
            text: 'Unable to check the knowledge base right now. Please select a guided option below or contact human support.',
            suggestEscalation: true,
          },
        ]);
      }
    } catch {
      onAppendTurns([
        {
          id: `asst-net-${stamp}`,
          sender: 'assistant',
          text: 'Connection interrupted. You can continue using the guided options below or request human support.',
          suggestEscalation: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div
      className={`w-full rounded-2xl bg-white border transition-colors duration-200 shadow-sm overflow-hidden flex flex-col ${
        highlighted ? 'border-blue-600 ring-4 ring-blue-600/10' : 'border-slate-200/90'
      }`}
      aria-label={`Interactive ${chatbotConfig.assistantName} support assistant`}
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
        className="px-5 py-5 space-y-3.5 min-h-[240px] max-h-[320px] overflow-y-auto bg-gradient-to-b from-white to-slate-50/50"
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
                className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isAssistant
                      ? 'bg-slate-100 text-slate-900 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}
                >
                  {turn.text}
                </div>
                {isAssistant && turn.sourceLabel && (
                  <p className="mt-1 px-1 text-[11px] text-slate-400">
                    {turn.sourceLabel}
                  </p>
                )}
                {isAssistant && turn.suggestEscalation && onRequestEscalation && (
                  <button
                    type="button"
                    onClick={() => onRequestEscalation()}
                    className="mt-1.5 px-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Send to Human Support &rarr;
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Natural-Language Question Input */}
      {onAppendTurns && (
        <form
          onSubmit={handleAskNaturalLanguage}
          className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2"
        >
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask a question about our supported topics..."
            aria-label="Ask a support question"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={asking || !questionInput.trim()}
            aria-label="Send question"
            className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{asking ? 'Checking...' : 'Ask'}</span>
          </button>
        </form>
      )}

      {/* Interactive Guided Options Tray */}
      <div className="px-5 py-4 border-t border-slate-100 bg-white">
        {currentNode.options.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 mb-2">
              Or choose a guided support path:
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
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
              <span>Guided step complete</span>
            </div>
            <div className="flex items-center gap-2">
              {currentNodeId === 'human_handoff' && onRequestEscalation && (
                <button
                  type="button"
                  onClick={() => onRequestEscalation()}
                  className="py-2 px-4 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Support Form
                </button>
              )}
              <button
                type="button"
                onClick={onReset}
                className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Explore Another Topic
              </button>
            </div>
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
  return (
    (chatbotConfig.nodes[nodeId] ?? chatbotConfig.nodes.root)?.reply ??
    chatbotConfig.initialGreeting
  );
}

'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, ArrowRight, CheckCircle2 } from 'lucide-react';

export type SupportTopicId = 'deposit' | 'product' | 'account' | 'other' | 'human';

export interface DemoOption {
  id: string;
  label: string;
  nextNodeId: string;
}

interface DemoNode {
  id: string;
  reply: string;
  options: DemoOption[];
  isCompleted?: boolean;
}

export interface ChatTurn {
  id: string;
  sender: 'assistant' | 'customer';
  text: string;
}

export const INITIAL_GREETING =
  'Hi! 👋 Welcome to CareFlow. What can I help you with today?';

export const ROOT_OPTIONS: DemoOption[] = [
  {
    id: 'opt-deposit',
    label: 'I have a deposit problem.',
    nextNodeId: 'deposit_root',
  },
  {
    id: 'opt-product',
    label: 'I need help using a product.',
    nextNodeId: 'product_root',
  },
  {
    id: 'opt-broken',
    label: "Something isn't working.",
    nextNodeId: 'issue_root',
  },
  {
    id: 'opt-human',
    label: 'I want to speak with support.',
    nextNodeId: 'human_root',
  },
];

const FLOW_NODES: Record<string, DemoNode> = {
  root: {
    id: 'root',
    reply: INITIAL_GREETING,
    options: ROOT_OPTIONS,
  },
  deposit_root: {
    id: 'deposit_root',
    reply:
      'I can walk you through deposit assistance. Which situation best describes what you are experiencing?',
    options: [
      {
        id: 'dep-missing',
        label: 'My balance has not updated yet.',
        nextNodeId: 'deposit_missing',
      },
      {
        id: 'dep-confirm',
        label: 'I need help checking payment confirmation.',
        nextNodeId: 'deposit_confirm',
      },
      {
        id: 'dep-human',
        label: 'Connect me with a human representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  deposit_missing: {
    id: 'deposit_missing',
    reply:
      'Please check that your payment receipt or transaction reference matches your account details. Would you like to review the confirmation checklist or pass this to a human representative?',
    options: [
      {
        id: 'dep-missing-check',
        label: 'Review confirmation checklist.',
        nextNodeId: 'deposit_confirm',
      },
      {
        id: 'dep-missing-human',
        label: 'Pass to a human representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  deposit_confirm: {
    id: 'deposit_confirm',
    reply:
      'Keep your payment reference or confirmation screenshot handy so your deposit can be verified accurately. Did this help clarify the next step?',
    options: [
      {
        id: 'dep-resolved',
        label: 'Yes, I found what I needed.',
        nextNodeId: 'resolved_end',
      },
      {
        id: 'dep-still-need-help',
        label: 'I still need help from a person.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  product_root: {
    id: 'product_root',
    reply:
      'Happy to help you get the most out of your product. What would you like guidance on today?',
    options: [
      {
        id: 'prod-start',
        label: 'Getting started and core steps.',
        nextNodeId: 'product_guide',
      },
      {
        id: 'prod-feature',
        label: 'Understanding how a feature works.',
        nextNodeId: 'product_guide',
      },
      {
        id: 'prod-human',
        label: 'Ask a human support representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  product_guide: {
    id: 'product_guide',
    reply:
      'Follow the step-by-step instructions inside your product workspace and make sure all required fields are completed before continuing. Would you like further assistance?',
    options: [
      {
        id: 'prod-resolved',
        label: 'That answered my question.',
        nextNodeId: 'resolved_end',
      },
      {
        id: 'prod-escalate',
        label: 'Connect me with human support.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  issue_root: {
    id: 'issue_root',
    reply:
      "Let's narrow down what isn't working so we can guide you or share clear context with support.",
    options: [
      {
        id: 'iss-account',
        label: 'An account setting or sign-in issue.',
        nextNodeId: 'account_root',
      },
      {
        id: 'iss-screen',
        label: 'A page or action is not responding.',
        nextNodeId: 'issue_steps',
      },
      {
        id: 'iss-human',
        label: 'Speak with a human representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  issue_steps: {
    id: 'issue_steps',
    reply:
      'Try refreshing your current session and confirming your connection is stable. If the issue persists, a support representative can look into it with you.',
    options: [
      {
        id: 'iss-fixed',
        label: 'It is working now.',
        nextNodeId: 'resolved_end',
      },
      {
        id: 'iss-handoff',
        label: 'Pass my enquiry to human support.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  account_root: {
    id: 'account_root',
    reply:
      'For account-related enquiries, we can walk through common account questions or connect you with a representative.',
    options: [
      {
        id: 'acc-profile',
        label: 'Updating my account details.',
        nextNodeId: 'account_steps',
      },
      {
        id: 'acc-human',
        label: 'Connect with a human representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  account_steps: {
    id: 'account_steps',
    reply:
      'You can review your current profile information in your account settings area. If something cannot be changed directly, a support representative can assist you.',
    options: [
      {
        id: 'acc-resolved',
        label: 'Got it, thank you.',
        nextNodeId: 'resolved_end',
      },
      {
        id: 'acc-escalate',
        label: 'Speak with support.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  other_root: {
    id: 'other_root',
    reply:
      'Have another question? Choose how you would like to proceed below.',
    options: [
      {
        id: 'oth-deposit',
        label: 'Check deposit assistance.',
        nextNodeId: 'deposit_root',
      },
      {
        id: 'oth-product',
        label: 'Check product usage help.',
        nextNodeId: 'product_root',
      },
      {
        id: 'oth-human',
        label: 'Connect with a human representative.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  human_root: {
    id: 'human_root',
    reply:
      'Of course. Before we pass your enquiry to a human support representative, which topic is your question about?',
    options: [
      {
        id: 'hum-dep',
        label: 'Deposit assistance.',
        nextNodeId: 'human_handoff',
      },
      {
        id: 'hum-prod',
        label: 'Using a product.',
        nextNodeId: 'human_handoff',
      },
      {
        id: 'hum-gen',
        label: 'Account or another enquiry.',
        nextNodeId: 'human_handoff',
      },
    ],
  },
  human_handoff: {
    id: 'human_handoff',
    reply:
      'Your selected topic is ready to be passed to a human support representative. In this interactive preview, no live request is sent—click Start Over anytime to explore other guided paths.',
    options: [],
    isCompleted: true,
  },
  resolved_end: {
    id: 'resolved_end',
    reply:
      'Glad that helped you move forward! You can restart this guided preview at any time if you have another question.',
    options: [],
    isCompleted: true,
  },
};

export interface GuidedSupportPreviewProps {
  turns: ChatTurn[];
  currentNodeId: string;
  onSelectOption: (label: string, nextNodeId: string) => void;
  onReset: () => void;
  highlighted?: boolean;
}

export function GuidedSupportPreview({
  turns,
  currentNodeId,
  onSelectOption,
  onReset,
  highlighted = false,
}: GuidedSupportPreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentNode = FLOW_NODES[currentNodeId] ?? FLOW_NODES.root;

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
      aria-label="Interactive CareFlow guided support preview"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50/70">
        <div>
          <p className="text-sm font-bold text-slate-900 tracking-tight">CareFlow Assistant</p>
          <p className="text-xs text-slate-500">Guided support · Interactive preview</p>
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

export function getReplyForNode(nodeId: string): string {
  return (FLOW_NODES[nodeId] ?? FLOW_NODES.root).reply;
}

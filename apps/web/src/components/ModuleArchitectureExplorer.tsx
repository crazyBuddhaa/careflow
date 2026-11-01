'use client';

import React, { useState } from 'react';

type ModuleFilter = 'all' | 'channels' | 'automation' | 'operations';

interface ModuleItem {
  index: string;
  title: string;
  category: Exclude<ModuleFilter, 'all'>;
  packagePath: string;
  summary: string;
}

const MODULES: ModuleItem[] = [
  {
    index: '01',
    title: 'Smart Troubleshooting Flows',
    category: 'automation',
    packagePath: 'modules/smart-troubleshooting',
    summary:
      'Decision-tree diagnostics that resolve common configuration, billing, and account issues before a ticket enters the human queue.',
  },
  {
    index: '02',
    title: 'Structured Knowledge Base',
    category: 'automation',
    packagePath: 'modules/knowledge-base',
    summary:
      'Versioned resolution articles indexed by product category so self-service steps and human agents reference identical canonical answers.',
  },
  {
    index: '03',
    title: 'Unified Conversations Core',
    category: 'channels',
    packagePath: 'modules/conversations',
    summary:
      'Channel-agnostic conversation state machine connecting web widget sessions and Telegram threads to a single PostgreSQL record.',
  },
  {
    index: '04',
    title: 'Messages & Attachments Ledger',
    category: 'channels',
    packagePath: 'modules/messages',
    summary:
      'Ordered message persistence prepared for Supabase Realtime broadcast topics and signed private Supabase Storage attachments.',
  },
  {
    index: '05',
    title: 'Telegram Channel Adapter',
    category: 'channels',
    packagePath: 'modules/telegram-integration',
    summary:
      'Normalized inbound webhook envelope contract allowing customers on Telegram to reach the exact same routing pipeline as web visitors.',
  },
  {
    index: '06',
    title: 'Context-Preserving Escalation',
    category: 'operations',
    packagePath: 'modules/human-escalation',
    summary:
      'Transfers unresolved diagnostic steps, environment context, and priority tiers directly to human specialists without asking customers to repeat themselves.',
  },
  {
    index: '07',
    title: 'Customer Identity Management',
    category: 'operations',
    packagePath: 'modules/customer-management',
    summary:
      'Links external application user IDs, email addresses, and preferred channels across multi-tenant organization boundaries.',
  },
  {
    index: '08',
    title: 'Agent Capacity & Routing',
    category: 'operations',
    packagePath: 'modules/agent-management',
    summary:
      'Tracks specialist availability and active conversation load to route escalated issues cleanly.',
  },
  {
    index: '09',
    title: 'Authentication & Role Policy',
    category: 'operations',
    packagePath: 'modules/authentication',
    summary:
      'Decouples role hierarchy checks (Customer, Agent, Supervisor, Admin) from React components while pairing with Supabase Auth and RLS.',
  },
];

export function ModuleArchitectureExplorer() {
  const [filter, setFilter] = useState<ModuleFilter>('all');

  const visibleModules =
    filter === 'all' ? MODULES : MODULES.filter((item) => item.category === filter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs text-slate-500">
            Domain Architecture · <span className="font-mono">@careflow/support-engine</span>
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Nine decoupled domain modules engineered for portable scale
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Filter support modules"
          className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg self-start"
        >
          {(
            [
              { id: 'all', label: 'All Modules' },
              { id: 'automation', label: 'Self-Service' },
              { id: 'channels', label: 'Channels' },
              { id: 'operations', label: 'Operations' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={filter === tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {visibleModules.map((mod, idx) => {
          const isFeatured = filter === 'all' && idx === 0;
          return (
            <article
              key={mod.index}
              className={`border border-slate-200 bg-white p-6 sm:p-7 rounded-xl flex flex-col justify-between gap-4 ${
                isFeatured ? 'md:col-span-2' : 'md:col-span-1'
              }`}
            >
              <div>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {mod.index} · {mod.packagePath}
                </p>
                <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-slate-900">
                  {mod.index}. {mod.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-prose">
                  {mod.summary}
                </p>
              </div>
              <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
                Service Port Ready · Portable TypeScript Contract
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

import { UserRole } from '@careflow/shared';
import { sanitizeCustomerFacingText } from '@careflow/database/d1';
import { requireAuthorizedWorkspaceSession } from '@/lib/admin-auth';
import { jsonApiError, jsonApiSuccess } from '@/lib/api-response';
import {
  getKnowledgeManagementService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export interface CopilotKnowledgeSuggestionItem {
  id: string;
  type: 'faq' | 'article' | 'procedure';
  title: string;
  category: string;
  snippet: string;
  insertText: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { id: conversationId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: 'suggest_reply' | 'search_kb';
      query?: string;
    };

    const action = body.action ?? 'suggest_reply';
    const organizationId = auth.session.identity.organizationId;
    const organizationName = auth.session.organizationName || 'Support Team';
    const organizationSlug = auth.session.organizationSlug || '';
    const agentName = auth.session.userName || 'Support Specialist';

    const workspaceRepo = await getWorkspaceRepository();
    const knowledgeService = await getKnowledgeManagementService();

    const conversation = await workspaceRepo.getConversationById(
      organizationId,
      conversationId,
      { includeInternalNotes: true }
    );

    if (!conversation) {
      return jsonApiError('NOT_FOUND', 'Conversation not found in this workspace.', 404);
    }

    const portalConfig = await workspaceRepo.getWorkspaceSettings(organizationId);
    const customerMessages = conversation.messages.filter(
      (m) => m.senderType === 'customer' && !m.isInternalNote
    );
    const latestCustomerMessage =
      customerMessages[customerMessages.length - 1]?.body ||
      conversation.subject ||
      '';

    const searchQuery =
      body.query && body.query.trim().length > 0
        ? body.query.trim()
        : `${latestCustomerMessage} ${conversation.category}`.trim();

    // Retrieve matching published knowledge items
    const retrievedMatches = await knowledgeService
      .retrievePublishedKnowledge({
        organizationId,
        query: searchQuery,
        limit: 6,
      })
      .catch(() => []);

    const kbSuggestions: CopilotKnowledgeSuggestionItem[] = [];

    for (const match of retrievedMatches) {
      const cleanBody = sanitizeCustomerFacingText(match.fullBody || match.excerpt);
      kbSuggestions.push({
        id: match.citation.sourceId,
        type: match.citation.sourceType === 'faq' ? 'faq' : 'article',
        title: match.citation.titleOrQuestion,
        category: match.citation.categoryName || 'Knowledge Base',
        snippet: sanitizeCustomerFacingText(match.excerpt),
        insertText: cleanBody,
      });
    }

    // Supplement from portalConfig FAQs / Articles / Procedures when keyword filter matches or query is broad
    const qLower = searchQuery.toLowerCase();
    for (const faq of portalConfig.faqs) {
      if (kbSuggestions.some((s) => s.title === faq.question)) continue;
      if (
        !body.query ||
        faq.question.toLowerCase().includes(qLower) ||
        faq.answer.toLowerCase().includes(qLower) ||
        kbSuggestions.length < 4
      ) {
        const cleanAnswer = sanitizeCustomerFacingText(faq.answer);
        kbSuggestions.push({
          id: faq.id,
          type: 'faq',
          title: faq.question,
          category: faq.categoryName || 'FAQ',
          snippet: cleanAnswer.slice(0, 180),
          insertText: cleanAnswer,
        });
      }
      if (kbSuggestions.length >= 8) break;
    }

    for (const proc of portalConfig.procedures ?? []) {
      if (!proc.isPublished) continue;
      const stepsText = proc.steps
        .map((s) => `${s.stepNumber}. ${s.instruction}`)
        .join('\n');
      if (
        !body.query ||
        proc.title.toLowerCase().includes(qLower) ||
        stepsText.toLowerCase().includes(qLower)
      ) {
        kbSuggestions.push({
          id: proc.id,
          type: 'procedure',
          title: proc.title,
          category: proc.category,
          snippet: stepsText.slice(0, 180),
          insertText: sanitizeCustomerFacingText(stepsText),
        });
      }
    }

    if (action === 'search_kb') {
      return jsonApiSuccess({
        conversationId: conversation.id,
        query: searchQuery,
        suggestions: kbSuggestions.slice(0, 8),
      });
    }

    // action === 'suggest_reply': Generate a grounded 1-click AI/KB draft reply for the agent to review & edit
    const recentHistory = conversation.messages
      .filter((m) => !m.isInternalNote)
      .slice(-6)
      .map((m) => ({
        role:
          m.senderType === 'customer'
            ? ('customer' as const)
            : m.senderType === 'agent'
              ? ('agent' as const)
              : ('bot' as const),
        text: m.body,
      }));

    const resolution = await workspaceRepo.answerPortalQuestion(
      organizationSlug || portalConfig.slug,
      latestCustomerMessage,
      {
        requirePublished: false,
        viewerOrganizationId: organizationId,
        conversationHistory: recentHistory,
        interactiveConversation: false,
      }
    );

    const customerFirstName =
      conversation.customerName.trim().split(/\s+/)[0] || 'there';

    let coreDraftBody: string;
    let matchedSourceTitle = resolution?.matchedSourceTitle ?? null;
    let resolutionLayer = resolution?.resolutionLayer ?? 'knowledge-base';

    if (
      resolution &&
      resolution.resolutionLayer !== 'human-escalation' &&
      resolution.reply
    ) {
      coreDraftBody = sanitizeCustomerFacingText(resolution.reply);
    } else if (kbSuggestions.length > 0 && kbSuggestions[0]) {
      coreDraftBody = kbSuggestions[0].insertText;
      matchedSourceTitle = kbSuggestions[0].title;
      resolutionLayer = 'knowledge-base';
    } else {
      coreDraftBody =
        `Thank you for reaching out to ${organizationName} regarding "${conversation.subject}". ` +
        `I am reviewing your account details now and will follow up with the verification status shortly. ` +
        `Please let me know if you have any additional reference details or screenshots to share.`;
      matchedSourceTitle = `${organizationName} Specialist Template`;
      resolutionLayer = 'guided-troubleshooting';
    }

    const suggestedReply =
      `Hi ${customerFirstName},\n\n` +
      `${coreDraftBody}\n\n` +
      `Best regards,\n` +
      `${agentName} · ${organizationName} Support`;

    return jsonApiSuccess({
      conversationId: conversation.id,
      customerQuery: latestCustomerMessage,
      suggestedReply,
      matchedSourceTitle,
      resolutionLayer,
      suggestions: kbSuggestions.slice(0, 6),
    });
  } catch (error) {
    return jsonApiError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unable to generate copilot suggestion.',
      500
    );
  }
}

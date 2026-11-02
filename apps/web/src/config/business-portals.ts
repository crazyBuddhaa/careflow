import type { BusinessPortalConfig } from '@careflow/shared';
import {
  classifyTenantHostname,
  type BusinessPortalRegistryPort,
} from '@careflow/support-engine';

const ULTIMATE_TECH_APP_GREETING =
  'Hi! 👋 Welcome to CareFlow. What can I help you with today?';

/**
 * Isolated business portal configuration for UltimateTechApp.
 * Stored as tenant configuration data rather than hardcoded into the global platform UI.
 * In future milestones, this registry adapter will query Cloudflare D1 scoped by organizationId.
 */
const ULTIMATE_TECH_APP_PORTAL: BusinessPortalConfig = {
  organizationId: 'org_ultimatetechapp',
  slug: 'ultimatetechapp',
  verifiedHostnames: [
    'ultimatetechapp.careflow.com',
    'ultimatetechapp.localhost',
  ],
  branding: {
    displayName: 'UltimateTechApp',
    logoText: 'UltimateTechApp Support',
    accentTheme: 'blue-teal',
    portalSubtitle: 'Customer Support Portal · UltimateTechApp',
  },
  welcomeHeadline: 'Get help. Find answers. Move forward.',
  welcomeDescription:
    'Need help with a deposit or using a product? Find answers through guided support or connect with a human representative when you need one.',
  primaryCtaLabel: 'Start a Conversation',
  secondaryCtaLabel: 'Explore Help Topics',
  categories: [
    {
      id: 'deposit-assistance',
      title: 'Deposit Assistance',
      description: 'Help with deposits, payment confirmation and missing balances.',
      actionLabel: 'Start deposit guide',
      customerPrompt: 'I have a deposit problem.',
      targetNodeId: 'deposit_root',
      iconKey: 'wallet',
    },
    {
      id: 'product-support',
      title: 'Product Support',
      description: 'Learn how to use products and resolve common issues.',
      actionLabel: 'Explore product help',
      customerPrompt: 'I need help using a product.',
      targetNodeId: 'product_root',
      iconKey: 'compass',
    },
    {
      id: 'account-assistance',
      title: 'Account Assistance',
      description: 'Get help with account-related enquiries.',
      actionLabel: 'Get account help',
      customerPrompt: 'I need help with an account enquiry.',
      targetNodeId: 'account_root',
      iconKey: 'user-check',
    },
    {
      id: 'other-enquiries',
      title: 'Other Enquiries',
      description: 'Find assistance for other questions.',
      actionLabel: 'Ask another question',
      customerPrompt: 'I have another question.',
      targetNodeId: 'other_root',
      iconKey: 'help-circle',
    },
  ],
  publishedKnowledge: [
    {
      slug: 'deposit-reference-checklist',
      title: 'Preparing Your Deposit Reference for Verification',
      category: 'Deposit Assistance',
      summary:
        'Keep your payment receipt or transaction reference matched with your account details before requesting manual review.',
    },
    {
      slug: 'getting-started-product-workspace',
      title: 'Navigating Your Product Workspace',
      category: 'Product Support',
      summary:
        'Follow the step-by-step instructions inside your product workspace and ensure required fields are completed.',
    },
  ],
  faqs: [
    {
      id: 'faq-deposit-1',
      categoryId: 'deposit-assistance',
      question: 'What should I check if my deposit balance has not updated?',
      answer:
        'Verify that your payment confirmation or transaction reference matches your account details, then use the guided deposit assistant to check next steps or pass your enquiry to a representative.',
    },
    {
      id: 'faq-product-1',
      categoryId: 'product-support',
      question: 'Where can I learn how to use a specific product feature?',
      answer:
        'Select Product Support in the guided assistant to walk through core workspace steps or connect with a human representative for tailored guidance.',
    },
    {
      id: 'faq-human-1',
      categoryId: 'other-enquiries',
      question: 'Can I speak with a human support representative?',
      answer:
        'Yes. Whenever guided assistance does not resolve your question, your enquiry and selected topic can be passed to a human support representative.',
    },
  ],
  chatbot: {
    assistantName: 'CareFlow Assistant',
    assistantSubtitle: 'UltimateTechApp · Guided support preview',
    initialGreeting: ULTIMATE_TECH_APP_GREETING,
    supportedTopics: [
      'Deposit assistance',
      'Payment confirmation',
      'Product usage guidance',
      'Account enquiries',
    ],
    restrictedTopics: [
      'Unrelated general trivia',
      'External third-party financial advice',
    ],
    communicationStyle: 'warm-helpful',
    nodes: {
      root: {
        id: 'root',
        reply: ULTIMATE_TECH_APP_GREETING,
        options: [
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
        ],
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
        reply: 'Have another question? Choose how you would like to proceed below.',
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
    },
  },
  escalation: {
    sectionEyebrow: 'Human Assistance',
    headline: 'Still need a helping hand?',
    description:
      "If guided assistance doesn't solve your problem, your enquiry can be passed to a human support representative.",
    ctaLabel: 'Contact Support',
    customerTriggerPrompt: 'I want to speak with support.',
    targetNodeId: 'human_root',
    supportInstructions:
      'Collect topic context through guided options before escalating unresolved issues to human support.',
  },
};

const REGISTERED_PORTALS: ReadonlyMap<string, BusinessPortalConfig> = new Map([
  [ULTIMATE_TECH_APP_PORTAL.slug, ULTIMATE_TECH_APP_PORTAL],
]);

export const businessPortalRegistry: BusinessPortalRegistryPort = {
  async resolveByHostname(rawHostname: string): Promise<BusinessPortalConfig | null> {
    const classification = classifyTenantHostname(rawHostname);

    if (classification.kind === 'business-portal' && classification.businessSlug) {
      return REGISTERED_PORTALS.get(classification.businessSlug) ?? null;
    }

    if (classification.kind === 'unknown-domain') {
      for (const portal of REGISTERED_PORTALS.values()) {
        if (portal.verifiedHostnames.includes(classification.hostname)) {
          return portal;
        }
      }
    }

    return null;
  },

  async resolveBySlug(slug: string): Promise<BusinessPortalConfig | null> {
    const normalized = slug.trim().toLowerCase();
    return REGISTERED_PORTALS.get(normalized) ?? null;
  },

  async listPublicPortalSlugs(): Promise<string[]> {
    return Array.from(REGISTERED_PORTALS.keys());
  },
};

export function getDefaultUltimateTechAppConfig(): BusinessPortalConfig {
  return ULTIMATE_TECH_APP_PORTAL;
}

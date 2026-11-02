import type {
  BusinessPortalConfig,
  CommunicationStyle,
  PortalAccentTheme,
} from '@careflow/shared';

const ULTIMATE_TECH_APP_GREETING =
  'Hi! 👋 Welcome to CareFlow. What can I help you with today?';

export const ULTIMATE_TECH_APP_PRESET: BusinessPortalConfig = {
  organizationId: 'org_ultimatetechapp',
  slug: 'ultimatetechapp',
  verifiedHostnames: ['ultimatetechapp.careflow.com', 'ultimatetechapp.localhost'],
  contactEmail: 'support@ultimatetechapp.example',
  supportHours: 'Monday – Saturday · 08:00 – 20:00 UTC',
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
      slug: 'verifying-deposit-references',
      title: 'Verifying Deposit References and Payment Receipts',
      category: 'Deposits',
      summary:
        'Step-by-step checklist for matching your payment reference with your UltimateTechApp account.',
    },
    {
      slug: 'using-product-workspaces',
      title: 'Using Product Workspaces Correctly',
      category: 'Products and Services',
      summary: 'Overview of core workspace controls and required configuration fields.',
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
  procedures: [
    {
      id: 'proc_uta_missing_deposit',
      title: 'Missing Deposit Balance Verification',
      category: 'Deposits',
      triggerPhrases: ['missing deposit', 'balance not updated', 'payment pending', 'deposit delay'],
      steps: [
        {
          stepNumber: 1,
          instruction: 'Locate your payment confirmation receipt and copy the transaction reference.',
          expectedOutcome: 'Customer has exact payment reference string ready.',
        },
        {
          stepNumber: 2,
          instruction: 'Confirm the account identifier on the payment matches your UltimateTechApp profile.',
          expectedOutcome: 'Mismatched references are flagged immediately for manual specialist review.',
        },
        {
          stepNumber: 3,
          instruction: 'Allow standard settlement processing if the transfer was sent within the last 15 minutes.',
          expectedOutcome: 'Recent transfers settle automatically; older transfers escalate with reference attached.',
        },
      ],
      escalationRule: 'Escalate to Deposit Verification Specialist if balance remains unchanged after reference check.',
      isPublished: true,
    },
    {
      id: 'proc_uta_workspace_setup',
      title: 'Product Workspace Action Disabled Check',
      category: 'Products and Services',
      triggerPhrases: ['button disabled', 'cannot continue', 'workspace locked', 'product step'],
      steps: [
        {
          stepNumber: 1,
          instruction: 'Inspect the current product panel for required configuration fields.',
          expectedOutcome: 'All required inputs are populated with valid values.',
        },
        {
          stepNumber: 2,
          instruction: 'Refresh your active workspace session to confirm network connectivity.',
          expectedOutcome: 'Action controls unlock and save state cleanly.',
        },
      ],
      escalationRule: 'Escalate to Product Support if all required fields are complete and the control stays disabled.',
      isPublished: true,
    },
  ],
  chatbot: {
    assistantName: 'CareFlow Assistant',
    assistantSubtitle: 'UltimateTechApp · Guided & Knowledge Support',
    initialGreeting: ULTIMATE_TECH_APP_GREETING,
    supportedTopics: [
      'Deposit assistance',
      'Payment confirmation',
      'Product usage guidance',
      'Account enquiries',
      'Workspace troubleshooting',
    ],
    restrictedTopics: [
      'Unrelated general trivia',
      'External investment or tax advice',
      'Competitor platform comparisons',
    ],
    communicationStyle: 'warm-helpful',
    responsePriority: [
      'business-rules',
      'knowledge-base',
      'guided-troubleshooting',
      'ai-fallback',
      'human-escalation',
    ],
    aiFallback: {
      enabled: false,
      provider: 'gemini',
      confidenceThreshold: 0.78,
      dailyRequestCap: 500,
      systemInstructions:
        'Only answer questions strictly grounded in UltimateTechApp deposit verification, product workspace usage, and account settings. Never invent transaction statuses or financial policies.',
    },
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
          'Your selected topic is ready for human support. Use the Connect with Human Support form below to send your enquiry and conversation context directly to our team.',
        options: [],
        isCompleted: true,
      },
      resolved_end: {
        id: 'resolved_end',
        reply:
          'Glad that helped you move forward! You can restart this conversation or ask another question anytime.',
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
      'Collect topic context and payment/account reference before escalating unresolved issues to human support.',
  },
};

const NORTHSTAR_GREETING =
  'Hello! Welcome to Northstar Commerce Support. How can we help with your order or account today?';

export const NORTHSTAR_COMMERCE_PRESET: BusinessPortalConfig = {
  organizationId: 'org_northstar_commerce',
  slug: 'northstar-commerce',
  verifiedHostnames: ['northstar-commerce.careflow.com', 'northstar-commerce.localhost'],
  contactEmail: 'care@northstar-commerce.example',
  supportHours: 'Daily · 07:00 – 22:00 UTC',
  branding: {
    displayName: 'Northstar Commerce',
    logoText: 'Northstar Care',
    accentTheme: 'teal-slate',
    portalSubtitle: 'Order & Customer Care Portal · Northstar Commerce',
  },
  welcomeHeadline: 'Track orders, manage returns, and get fast answers.',
  welcomeDescription:
    'Check parcel delivery updates, start an exchange, review invoice details, or connect directly with a Northstar fulfillment specialist.',
  primaryCtaLabel: 'Ask Northstar Care',
  secondaryCtaLabel: 'Browse Order Topics',
  categories: [
    {
      id: 'orders-and-shipping',
      title: 'Orders & Shipping',
      description: 'Parcel tracking codes, dispatch timelines, and delivery address checks.',
      actionLabel: 'Check order help',
      customerPrompt: 'Where is my parcel order?',
      targetNodeId: 'ns_order_root',
      iconKey: 'compass',
    },
    {
      id: 'returns-and-exchanges',
      title: 'Returns & Exchanges',
      description: '30-day return eligibility, prepaid labels, and size exchanges.',
      actionLabel: 'Start return guide',
      customerPrompt: 'I want to return or exchange an item.',
      targetNodeId: 'ns_return_root',
      iconKey: 'wallet',
    },
    {
      id: 'account-and-billing',
      title: 'Invoices & Account',
      description: 'Download VAT invoices, update saved addresses, and manage preferences.',
      actionLabel: 'View billing help',
      customerPrompt: 'I need a copy of my order invoice.',
      targetNodeId: 'ns_billing_root',
      iconKey: 'user-check',
    },
    {
      id: 'specialist-support',
      title: 'Fulfillment Specialist',
      description: 'Speak with our fulfillment desk for damaged parcels or custom shipments.',
      actionLabel: 'Reach fulfillment desk',
      customerPrompt: 'I need to speak with a fulfillment specialist.',
      targetNodeId: 'ns_human_root',
      iconKey: 'help-circle',
    },
  ],
  publishedKnowledge: [
    {
      slug: 'tracking-dispatched-parcels',
      title: 'Tracking Dispatched Parcels and Carrier Scans',
      category: 'Orders and Shipping',
      summary:
        'How to locate your Northstar tracking code and interpret carrier scan milestones.',
    },
  ],
  faqs: [
    {
      id: 'faq_ns_order_1',
      categoryId: 'orders-and-shipping',
      question: 'Where do I find my Northstar order tracking code?',
      answer:
        'Your tracking code is listed inside your Northstar order confirmation summary once your parcel has been dispatched.',
    },
  ],
  procedures: [
    {
      id: 'proc_ns_delayed_parcel',
      title: 'Delayed Parcel Carrier Investigation',
      category: 'Orders and Shipping',
      triggerPhrases: ['where is my order', 'parcel delayed', 'tracking stuck', 'late delivery'],
      steps: [
        {
          stepNumber: 1,
          instruction: 'Open your Northstar order summary and check whether the parcel status shows Dispatched.',
          expectedOutcome: 'Confirms parcel has left the warehouse and has an assigned tracking number.',
        },
        {
          stepNumber: 2,
          instruction: 'Allow 24 hours after initial dispatch for the first regional carrier hub scan to appear.',
          expectedOutcome: 'Resolves newly dispatched tracking delays without manual intervention.',
        },
      ],
      escalationRule: 'Escalate to Fulfillment Desk with Order ID if no carrier scan appears 48 hours after dispatch.',
      isPublished: true,
    },
  ],
  chatbot: {
    assistantName: 'Northstar Care Assistant',
    assistantSubtitle: 'Northstar Commerce · Order & Return Guide',
    initialGreeting: NORTHSTAR_GREETING,
    supportedTopics: [
      'Order tracking and shipping',
      'Returns and size exchanges',
      'Invoices and billing receipts',
      'Delivery address updates',
    ],
    restrictedTopics: [
      'Wholesale supplier negotiations',
      'Unrelated general knowledge questions',
    ],
    communicationStyle: 'professional-concise',
    responsePriority: [
      'business-rules',
      'knowledge-base',
      'guided-troubleshooting',
      'ai-fallback',
      'human-escalation',
    ],
    aiFallback: {
      enabled: false,
      provider: 'gemini',
      confidenceThreshold: 0.8,
      dailyRequestCap: 400,
      systemInstructions:
        'Assist Northstar Commerce customers strictly with order tracking, returns, and invoices. Never promise custom refund overrides without human approval.',
    },
    nodes: {
      root: {
        id: 'root',
        reply: NORTHSTAR_GREETING,
        options: [
          {
            id: 'ns-opt-order',
            label: 'Where is my parcel order?',
            nextNodeId: 'ns_order_root',
          },
          {
            id: 'ns-opt-return',
            label: 'I want to return or exchange an item.',
            nextNodeId: 'ns_return_root',
          },
          {
            id: 'ns-opt-invoice',
            label: 'I need a copy of my order invoice.',
            nextNodeId: 'ns_billing_root',
          },
          {
            id: 'ns-opt-human',
            label: 'Speak with a fulfillment specialist.',
            nextNodeId: 'ns_human_root',
          },
        ],
      },
      ns_order_root: {
        id: 'ns_order_root',
        reply:
          'Your tracking code appears in your Northstar order confirmation summary as soon as your parcel is dispatched. Has it been more than 48 hours since dispatch with no scan?',
        options: [
          {
            id: 'ns-ord-ok',
            label: 'I found my tracking link, thanks.',
            nextNodeId: 'resolved_end',
          },
          {
            id: 'ns-ord-escalate',
            label: 'No carrier scan after 48 hours.',
            nextNodeId: 'human_handoff',
          },
        ],
      },
      ns_return_root: {
        id: 'ns_return_root',
        reply:
          'Unworn items in original packaging can be returned or exchanged within 30 days of delivery using our prepaid return label inside your order summary.',
        options: [
          {
            id: 'ns-ret-ok',
            label: 'That answers my return question.',
            nextNodeId: 'resolved_end',
          },
          {
            id: 'ns-ret-damaged',
            label: 'My item arrived damaged—connect me to support.',
            nextNodeId: 'human_handoff',
          },
        ],
      },
      ns_billing_root: {
        id: 'ns_billing_root',
        reply:
          'Downloadable PDF invoices are attached to every completed order inside Account -> Order History. Need a custom VAT amendment?',
        options: [
          {
            id: 'ns-bil-ok',
            label: 'Found my invoice, thank you.',
            nextNodeId: 'resolved_end',
          },
          {
            id: 'ns-bil-human',
            label: 'Request VAT invoice assistance.',
            nextNodeId: 'human_handoff',
          },
        ],
      },
      ns_human_root: {
        id: 'ns_human_root',
        reply:
          'We can connect you right away with a Northstar fulfillment specialist. Please share your Order ID in the escalation form below.',
        options: [
          {
            id: 'ns-hum-go',
            label: 'Open specialist request form.',
            nextNodeId: 'human_handoff',
          },
        ],
      },
      human_handoff: {
        id: 'human_handoff',
        reply:
          'Ready to connect you with a Northstar fulfillment specialist. Complete the short form below so we have your Order ID and conversation context.',
        options: [],
        isCompleted: true,
      },
      resolved_end: {
        id: 'resolved_end',
        reply:
          'Glad we could help with your Northstar order! Feel free to ask another question anytime.',
        options: [],
        isCompleted: true,
      },
    },
  },
  escalation: {
    sectionEyebrow: 'Fulfillment Desk',
    headline: 'Need help with a specific shipment?',
    description:
      'Share your Northstar Order ID and our fulfillment specialists will follow up with full conversation context.',
    ctaLabel: 'Contact Fulfillment Desk',
    customerTriggerPrompt: 'I need to speak with a fulfillment specialist.',
    targetNodeId: 'ns_human_root',
    supportInstructions:
      'Capture the customer Order ID and shipping issue type prior to escalating to the Fulfillment Desk.',
  },
};

export function buildDefaultPortalConfigForNewBusiness(params: {
  organizationId: string;
  slug: string;
  businessName: string;
  contactEmail: string;
  accentTheme: PortalAccentTheme;
  welcomeHeadline: string;
  welcomeDescription: string;
  initialGreeting: string;
  supportedTopics: string[];
  restrictedTopics: string[];
  communicationStyle: CommunicationStyle;
}): BusinessPortalConfig {
  const {
    organizationId,
    slug,
    businessName,
    contactEmail,
    accentTheme,
    welcomeHeadline,
    welcomeDescription,
    initialGreeting,
    supportedTopics,
    restrictedTopics,
    communicationStyle,
  } = params;

  const firstTopic = supportedTopics[0] ?? 'Product Support';
  const secondTopic = supportedTopics[1] ?? 'Account & Billing';

  return {
    organizationId,
    slug,
    verifiedHostnames: [`${slug}.careflow.com`, `${slug}.localhost`],
    contactEmail,
    supportHours: '',
    branding: {
      displayName: businessName,
      logoText: `${businessName} Support`,
      accentTheme,
      portalSubtitle: `Customer Support Portal · ${businessName}`,
    },
    welcomeHeadline,
    welcomeDescription,
    primaryCtaLabel: 'Start a Conversation',
    secondaryCtaLabel: 'Explore Help Topics',
    categories: [
      {
        id: 'primary-assistance',
        title: firstTopic,
        description: `Guided answers and step-by-step help for ${firstTopic.toLowerCase()}.`,
        actionLabel: 'Start guided check',
        customerPrompt: `I need help with ${firstTopic.toLowerCase()}.`,
        targetNodeId: 'topic_one',
        iconKey: 'compass',
      },
      {
        id: 'secondary-assistance',
        title: secondTopic,
        description: `Support articles and troubleshooting for ${secondTopic.toLowerCase()}.`,
        actionLabel: 'View guidance',
        customerPrompt: `I have a question about ${secondTopic.toLowerCase()}.`,
        targetNodeId: 'topic_two',
        iconKey: 'wallet',
      },
      {
        id: 'account-enquiries',
        title: 'Account Enquiries',
        description: `Manage your ${businessName} profile settings and access preferences.`,
        actionLabel: 'Get account help',
        customerPrompt: 'I need help with my account.',
        targetNodeId: 'topic_two',
        iconKey: 'user-check',
      },
      {
        id: 'human-support',
        title: 'Human Representative',
        description: `Connect with ${businessName} support when guided steps do not resolve your issue.`,
        actionLabel: 'Speak with support',
        customerPrompt: 'I want to speak with support.',
        targetNodeId: 'human_handoff',
        iconKey: 'help-circle',
      },
    ],
    publishedKnowledge: [],
    faqs: [],
    procedures: [
      {
        id: `proc_${slug}_starter`,
        title: `${firstTopic} Quick Diagnostic`,
        category: firstTopic,
        triggerPhrases: [firstTopic.toLowerCase(), 'not working', 'help'],
        steps: [
          {
            stepNumber: 1,
            instruction: `Verify your ${businessName} account details and recent activity summary.`,
            expectedOutcome: 'Confirms current workspace state before manual review.',
          },
        ],
        escalationRule: `Escalate to ${businessName} Support Team if the issue persists after completing step 1.`,
        isPublished: true,
      },
    ],
    chatbot: {
      assistantName: `${businessName} Assistant`,
      assistantSubtitle: `${businessName} · Guided & Knowledge Support`,
      initialGreeting,
      supportedTopics,
      restrictedTopics:
        restrictedTopics.length > 0
          ? restrictedTopics
          : ['Unrelated off-topic questions', 'External third-party services'],
      communicationStyle,
      responsePriority: [
        'business-rules',
        'knowledge-base',
        'guided-troubleshooting',
        'ai-fallback',
        'human-escalation',
      ],
      aiFallback: {
        enabled: false,
        provider: 'gemini',
        confidenceThreshold: 0.78,
        dailyRequestCap: 300,
        systemInstructions: `Only answer customer questions related to ${businessName} (${supportedTopics.join(', ')}). Never invent policies or prices.`,
      },
      nodes: {
        root: {
          id: 'root',
          reply: initialGreeting,
          options: [
            {
              id: 'opt-1',
              label: `Help with ${firstTopic.toLowerCase()}.`,
              nextNodeId: 'topic_one',
            },
            {
              id: 'opt-2',
              label: `Question about ${secondTopic.toLowerCase()}.`,
              nextNodeId: 'topic_two',
            },
            {
              id: 'opt-human',
              label: 'Connect with a human representative.',
              nextNodeId: 'human_handoff',
            },
          ],
        },
        topic_one: {
          id: 'topic_one',
          reply: `Let's check ${firstTopic.toLowerCase()}. You can also type a specific question below to search ${businessName}'s published knowledge base.`,
          options: [
            {
              id: 't1-ok',
              label: 'That answered my question.',
              nextNodeId: 'resolved_end',
            },
            {
              id: 't1-human',
              label: 'Pass my enquiry to human support.',
              nextNodeId: 'human_handoff',
            },
          ],
        },
        topic_two: {
          id: 'topic_two',
          reply: `For ${secondTopic.toLowerCase()}, check your account summary or let a ${businessName} specialist review your request.`,
          options: [
            {
              id: 't2-ok',
              label: 'Got it, thank you.',
              nextNodeId: 'resolved_end',
            },
            {
              id: 't2-human',
              label: 'Speak with human support.',
              nextNodeId: 'human_handoff',
            },
          ],
        },
        human_handoff: {
          id: 'human_handoff',
          reply: `Your enquiry is ready for ${businessName} human support. Submit your details below so a representative can follow up with full context.`,
          options: [],
          isCompleted: true,
        },
        resolved_end: {
          id: 'resolved_end',
          reply: 'Glad that helped! Feel free to start over or type another question anytime.',
          options: [],
          isCompleted: true,
        },
      },
    },
    escalation: {
      sectionEyebrow: 'Human Support',
      headline: 'Need assistance from our team?',
      description: `If guided steps don't resolve your enquiry, send it directly to a ${businessName} representative with your context attached.`,
      ctaLabel: 'Contact Support',
      customerTriggerPrompt: 'I want to speak with support.',
      targetNodeId: 'human_handoff',
      supportInstructions: `Gather topic context before escalating unresolved enquiries to ${businessName} specialists.`,
    },
  };
}

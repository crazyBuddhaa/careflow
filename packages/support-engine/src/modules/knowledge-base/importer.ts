export interface ParsedKnowledgeFaq {
  question: string;
  answer: string;
  categoryName: string;
}

export interface ParsedKnowledgeArticle {
  title: string;
  categoryName: string;
  shortDescription: string;
  content: string;
  tags: string[];
}

export interface ParsedKnowledgeCategory {
  name: string;
  slug: string;
  description: string;
  faqCount: number;
  articleCount: number;
}

export interface KnowledgeDocumentParseResult {
  documentTitle: string;
  categories: ParsedKnowledgeCategory[];
  articles: ParsedKnowledgeArticle[];
  faqs: ParsedKnowledgeFaq[];
  guardrails?: string[];
  summary: {
    totalCategories: number;
    totalArticles: number;
    totalFaqs: number;
    wordCount: number;
  };
}

export function cleanHeadingTitle(raw: string): string {
  return raw
    .replace(/^(?:section\s+)?(?:\d+(?:\.\d+)*|[A-Z]\.?)\s*[-.:)]\s*/i, '')
    .replace(/[#*_`]/g, '')
    .trim();
}

export function generateCategorySlug(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return base || `cat-${Date.now().toString(36)}`;
}

/**
 * Rewrites raw third-person support agent instructions and internal handbook guardrails
 * ("Ask the customer to...", "They should not send...", "Do not promise...", "Escalate for...")
 * into natural, polite second-person customer-facing language while stripping internal-only notes.
 */
export function sanitizeGuidelineTextForCustomer(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Remove explicit internal-only sections/blocks like "**Support rule:** ..." or "### Important public-page inconsistency — escalate"
  text = text.replace(
    /###\s+Important public-page inconsistency[\s\S]*?(?=(?:###|##|$))/gi,
    ''
  );
  text = text.replace(/\*\*Support rule:\*\*[^\n]+/gi, '');
  text = text.replace(
    /If a customer asks about a specific result[^\n]+/gi,
    ''
  );
  text = text.replace(
    /Do not state a pick, price or availability as current unless verified on the live page\.?/gi,
    ''
  );
  text = text.replace(/Never guarantee an outcome\.?/gi, '');
  text = text.replace(
    /Do not claim that [^\n.]+ unless this is verified in the live product\.?/gi,
    ''
  );
  text = text.replace(
    /If a tracker is missing, inaccessible or not saving entries, collect the error and escalate\.?/gi,
    'If your tracker is missing or not saving entries, please share the error details so our team can assist.'
  );
  text = text.replace(
    /Use these low-risk steps for general website problems:/gi,
    'Here are the recommended troubleshooting steps for general website issues:'
  );
  text = text.replace(
    /Do not ask a customer to disable security protections[^\n]+/gi,
    ''
  );

  // 2. Rewrite third-person imperative instructions into natural second-person customer speech
  text = text.replace(
    /([A-Za-z0-9_-]+) cannot confirm a payment outcome from a support conversation alone\.\s*Ask the customer to contact ([^\s]+)\s+with the ([^.]+)\./gi,
    'We cannot confirm a payment outcome from chat alone. Please share your $3 here (or email $2) so our billing team can verify your payment.'
  );

  text = text.replace(
    /Apologise and explain that the billing team needs to check the payment records\.\s*Ask for the ([^.]+)\./gi,
    "I'm sorry about that! Our billing team will need to check the payment records. Please share the $1 so we can investigate."
  );

  text = text.replace(
    /Ask the customer to sign out and sign back in once,\s*then check the plan page again\.\s*If access is still not updated,\s*escalate to ([^\s]+)\s+with the ([^.]+)\./gi,
    'Please try signing out and signing back in once, then check the plan page again. If your access is still not updated, please share your $2 here (or email $1) so our team can verify and update your plan.'
  );

  text = text.replace(
    /Ask the customer to contact ([^\s]+)\s+with ([^.]+)\./gi,
    'Please contact $1 (or share the details here) with $2.'
  );

  text = text.replace(
    /Ask the customer to ([^.]+)\./gi,
    (_match, action: string) => {
      const cleaned = action.trim().replace(/\btheir\b/gi, 'your').replace(/\bthey\b/gi, 'you');
      return `Please ${cleaned}.`;
    }
  );

  text = text.replace(
    /Ask for the ([^.]+)\./gi,
    'Please share the $1 so we can check this for you.'
  );

  text = text.replace(
    /Direct the customer to the live checkout page for the methods currently offered to their account\./gi,
    'You can check the live checkout page to see the payment methods currently available for your account.'
  );

  text = text.replace(
    /Direct the customer to ([^.]+)\./gi,
    (_match, target: string) => {
      const cleaned = target.trim().replace(/\btheir\b/gi, 'your');
      return `Please check ${cleaned}.`;
    }
  );

  text = text.replace(
    /If the customer cannot find the cancellation option or needs confirmation that renewal has stopped,\s*refer them to ([^.]+)\./gi,
    'If you cannot find the cancellation option or need confirmation that renewal has stopped, please contact $1 (or share your account email here so I can connect you with our team).'
  );

  text = text.replace(
    /Refer the request to ([^\s]+)\s+for review\./gi,
    'Please reach out to $1 (or share your account email here) so our team can review your request.'
  );

  text = text.replace(
    /They should not send full card details,\s*CVV,\s*PIN or OTP\./gi,
    'For your security, please never share your full card details, CVV, PIN, or OTP.'
  );

  text = text.replace(
    /Do not ask the customer to send card details through support chat\./gi,
    'For your security, please never share your full card details in support chat.'
  );

  text = text.replace(
    /Never request full card details or security codes\./gi,
    'For your security, please never share full card details or security codes.'
  );

  // 3. Strip internal prohibitions directed at the support agent
  text = text.replace(/Do not promise or approve a refund\.\s*/gi, '');
  text = text.replace(/Do not promise data recovery\.\s*/gi, '');
  text = text.replace(
    /Do not promise that a particular event or market is supported\.\s*/gi,
    ''
  );
  text = text.replace(
    /Do not claim the subscription has been activated until verified\.\s*/gi,
    ''
  );
  text = text.replace(
    /Support chat should not claim deletion is complete until the privacy team confirms it\.\s*/gi,
    ''
  );
  text = text.replace(
    /Escalate for payment-provider and subscription-status verification\.\s*/gi,
    ''
  );
  text = text.replace(
    /Escalate if the customer believes a normally available item has disappeared\.\s*/gi,
    'If you believe an event or market that is normally available is missing, let me know and I can escalate it to our team.'
  );
  text = text.replace(/Escalate to [^\s.]+\.[ \t]*/gi, '');
  text = text.replace(
    /Always check (https?:\/\/[^\s]+) before quoting a price to a customer\./gi,
    'Please check $1 for the latest pricing.'
  );

  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isInternalMetaGuidelineSection(sectionTitle: string): boolean {
  const lower = cleanHeadingTitle(sectionTitle).toLowerCase();
  return (
    lower.includes('instructions for') ||
    lower.includes('known limitations') ||
    lower.includes('facts the ai must not') ||
    lower.includes('what the ai must not') ||
    lower.includes('official source pages') ||
    lower.includes('information to collect before escalation')
  );
}

export function extractFirstSentence(text: string, fallback = 'Knowledge base guide.'): string {
  const sanitized = sanitizeGuidelineTextForCustomer(text);
  const clean = sanitized
    .replace(/^[#*-]\s+/gm, '')
    .replace(/[#*`_>\[\]|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = clean.match(/^([^.!?\n\r]+[.!?])/);
  if (match && match[1] && match[1].length > 15) {
    return match[1].slice(0, 240).trim();
  }
  return clean.slice(0, 200).trim() || fallback;
}

export function extractKnowledgeTags(text: string, category: string): string[] {
  const combined = `${text} ${category}`.toLowerCase();
  const knownKeywords = [
    'support',
    'punterstat',
    'account',
    'login',
    'password',
    'security',
    'mfa',
    '2fa',
    'payment',
    'pricing',
    'subscription',
    'billing',
    'refund',
    'premium',
    'pro',
    'free',
    'stripe',
    'paystack',
    'remita',
    'analysis',
    'learning',
    'betting',
    'calculator',
    'simulator',
    'odds',
    'value',
    'privacy',
    'data',
    'gdpr',
    'troubleshooting',
    'browser',
    'mobile',
    'escalation',
    'rules',
    'contact',
    'help',
    'guide',
  ];

  const matched = knownKeywords.filter((k) => combined.includes(k));
  if (matched.length > 0) {
    return matched.slice(0, 6);
  }

  const categoryWords = category
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  return categoryWords.length > 0 ? categoryWords.slice(0, 4) : ['general', 'support'];
}

/**
 * Parses a knowledge base document in Markdown, plain text, or JSON format.
 * Intelligently extracts structured Categories, Q&A FAQs, Help Articles, and Bot Guardrails,
 * while sanitizing raw agent instructions into customer-friendly responses.
 */
export function parseKnowledgeDocument(
  rawContent: string,
  fallbackDocumentTitle = 'Imported Knowledge Base'
): KnowledgeDocumentParseResult {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return {
      documentTitle: fallbackDocumentTitle,
      categories: [],
      articles: [],
      faqs: [],
      guardrails: [],
      summary: { totalCategories: 0, totalArticles: 0, totalFaqs: 0, wordCount: 0 },
    };
  }

  // 1. Check if the input is JSON (e.g. structured export)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(trimmed) as {
        title?: string;
        documentTitle?: string;
        categories?: Array<{ name: string; description?: string; slug?: string }>;
        articles?: Array<{
          title: string;
          category?: string;
          categoryName?: string;
          content: string;
          shortDescription?: string;
          tags?: string[];
        }>;
        faqs?: Array<{
          question: string;
          answer: string;
          category?: string;
          categoryName?: string;
        }>;
      };

      if (parsedJson.categories || parsedJson.articles || parsedJson.faqs) {
        const docTitle = parsedJson.documentTitle || parsedJson.title || fallbackDocumentTitle;
        const categoriesMap = new Map<string, ParsedKnowledgeCategory>();

        for (const cat of parsedJson.categories || []) {
          const name = cat.name.trim();
          categoriesMap.set(name, {
            name,
            slug: cat.slug || generateCategorySlug(name),
            description: cat.description || `Articles and FAQs regarding ${name}.`,
            faqCount: 0,
            articleCount: 0,
          });
        }

        const faqs: ParsedKnowledgeFaq[] = [];
        for (const f of parsedJson.faqs || []) {
          const catName = f.categoryName || f.category || 'General FAQs';
          if (!categoriesMap.has(catName)) {
            categoriesMap.set(catName, {
              name: catName,
              slug: generateCategorySlug(catName),
              description: `Frequently asked questions regarding ${catName}.`,
              faqCount: 0,
              articleCount: 0,
            });
          }
          categoriesMap.get(catName)!.faqCount++;
          faqs.push({
            question: f.question.trim(),
            answer: sanitizeGuidelineTextForCustomer(f.answer.trim()),
            categoryName: catName,
          });
        }

        const articles: ParsedKnowledgeArticle[] = [];
        for (const a of parsedJson.articles || []) {
          const catName = a.categoryName || a.category || 'General Support';
          if (!categoriesMap.has(catName)) {
            categoriesMap.set(catName, {
              name: catName,
              slug: generateCategorySlug(catName),
              description: `Help articles regarding ${catName}.`,
              faqCount: 0,
              articleCount: 0,
            });
          }
          categoriesMap.get(catName)!.articleCount++;
          const sanitizedContent = sanitizeGuidelineTextForCustomer(a.content.trim());
          articles.push({
            title: a.title.trim(),
            categoryName: catName,
            shortDescription:
              a.shortDescription
                ? sanitizeGuidelineTextForCustomer(a.shortDescription)
                : extractFirstSentence(sanitizedContent),
            content: sanitizedContent,
            tags: a.tags && a.tags.length > 0 ? a.tags : extractKnowledgeTags(a.title, catName),
          });
        }

        const categories = Array.from(categoriesMap.values());
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        return {
          documentTitle: docTitle,
          categories,
          articles,
          faqs,
          guardrails: [],
          summary: {
            totalCategories: categories.length,
            totalArticles: articles.length,
            totalFaqs: faqs.length,
            wordCount,
          },
        };
      }
    } catch {
      // Fall through to Markdown parsing if JSON parse fails
    }
  }

  // 2. Parse Markdown Structure
  const lines = trimmed.split('\n');
  let docTitle = fallbackDocumentTitle;

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('# ')) {
      docTitle = l.replace(/^#\s+/, '').trim();
      break;
    }
  }

  // Split into Level 2 Sections (## ...)
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections: { rawTitle: string; body: string }[] = [];
  let lastMatch: RegExpExecArray | null = null;
  let lastIndex = 0;

  while ((lastMatch = sectionRegex.exec(trimmed)) !== null) {
    if (lastMatch.index > lastIndex && sections.length > 0) {
      sections[sections.length - 1]!.body = trimmed.slice(lastIndex, lastMatch.index).trim();
    }
    sections.push({ rawTitle: lastMatch[1]!.trim(), body: '' });
    lastIndex = sectionRegex.lastIndex;
  }
  if (sections.length > 0 && lastIndex < trimmed.length) {
    sections[sections.length - 1]!.body = trimmed.slice(lastIndex).trim();
  }

  if (sections.length === 0) {
    sections.push({ rawTitle: docTitle, body: trimmed });
  }

  const categoriesMap = new Map<string, ParsedKnowledgeCategory>();
  const articles: ParsedKnowledgeArticle[] = [];
  const faqs: ParsedKnowledgeFaq[] = [];
  const guardrails: string[] = [];

  function ensureCategory(name: string, description = ''): string {
    const cleanName = cleanHeadingTitle(name) || 'General Support';
    const slug = generateCategorySlug(cleanName);
    if (!categoriesMap.has(cleanName)) {
      categoriesMap.set(cleanName, {
        name: cleanName,
        slug,
        description: description || `Articles and FAQs regarding ${cleanName}.`,
        faqCount: 0,
        articleCount: 0,
      });
    }
    return cleanName;
  }

  for (const sec of sections) {
    const cleanSecTitle = cleanHeadingTitle(sec.rawTitle);
    const body = sec.body;

    // If this section is purely internal AI instructions / limitations, record it as a guardrail
    if (isInternalMetaGuidelineSection(sec.rawTitle)) {
      guardrails.push(`${cleanSecTitle}: ${body.slice(0, 600).replace(/\s+/g, ' ').trim()}`);
      continue;
    }

    const catName = ensureCategory(sec.rawTitle);

    // 1. Pattern for Q&A pairs (FAQs)
    const faqPattern =
      /(?:###\s+Q:|\*\*Q:\*\*|^Q:)\s*([^\n\r]+)[\r\n]+(?:\*\*A:\*\*|^A:)\s*([\s\S]*?)(?=(?:[\r\n]+(?:###\s+Q:|\*\*Q:\*\*|^Q:|###\s+[^\n]+|##\s+[^\n]+))|$)/gim;

    let faqMatch: RegExpExecArray | null;
    const matchedFaqIndices: { start: number; end: number }[] = [];

    while ((faqMatch = faqPattern.exec(body)) !== null) {
      const q = faqMatch[1]!.replace(/\*\*|\*/g, '').trim();
      const rawA = faqMatch[2]!.replace(/^[\r\n]+|[\r\n]+$/g, '').trim();
      const a = sanitizeGuidelineTextForCustomer(rawA);
      if (q && a) {
        faqs.push({
          question: q,
          answer: a,
          categoryName: catName,
        });
        matchedFaqIndices.push({ start: faqMatch.index, end: faqPattern.lastIndex });
      }
    }

    // 2. Also extract "Customer: “...” / Assistant: “...”" sample dialogue pairs into natural FAQs
    const scenarioPattern =
      /Customer:\s*[“"']?([^\n”"']+)[”"']?\s*[\r\n]+Assistant:\s*[“"']?([^\n”"']+)[”"']?/gim;
    let scenarioMatch: RegExpExecArray | null;
    while ((scenarioMatch = scenarioPattern.exec(body)) !== null) {
      const q = scenarioMatch[1]!.trim();
      const a = sanitizeGuidelineTextForCustomer(scenarioMatch[2]!.trim());
      if (q && a) {
        faqs.push({
          question: q,
          answer: a,
          categoryName: catName,
        });
        matchedFaqIndices.push({
          start: scenarioMatch.index,
          end: scenarioPattern.lastIndex,
        });
      }
    }

    // Determine non-FAQ prose content
    let proseBody = body;
    // Sort matched indices in ascending order and remove from end to start
    matchedFaqIndices.sort((a, b) => a.start - b.start);
    for (let i = matchedFaqIndices.length - 1; i >= 0; i--) {
      const { start, end } = matchedFaqIndices[i]!;
      proseBody = proseBody.slice(0, start) + '\n\n' + proseBody.slice(end);
    }
    proseBody = proseBody
      .replace(/\*\*Scenario\s+\d+\s*[-—–][^\n]+\*\*/gi, '')
      .replace(/^---$/gm, '')
      .trim();

    // Check for subsections like ### 4.1 Bet Analysis
    const subSectionRegex = /^###\s+(?!Q:)(.+)$/gm;
    const subSections: { subTitle: string; subBody: string }[] = [];
    let subLastMatch: RegExpExecArray | null = null;
    let subLastIndex = 0;

    while ((subLastMatch = subSectionRegex.exec(proseBody)) !== null) {
      if (subLastMatch.index > subLastIndex && subSections.length > 0) {
        subSections[subSections.length - 1]!.subBody = proseBody
          .slice(subLastIndex, subLastMatch.index)
          .trim();
      }
      subSections.push({ subTitle: subLastMatch[1]!.trim(), subBody: '' });
      subLastIndex = subSectionRegex.lastIndex;
    }
    if (subSections.length > 0 && subLastIndex < proseBody.length) {
      subSections[subSections.length - 1]!.subBody = proseBody.slice(subLastIndex).trim();
    }

    if (subSections.length > 1) {
      for (const sub of subSections) {
        const cleanSub = cleanHeadingTitle(sub.subTitle);
        if (isInternalMetaGuidelineSection(cleanSub)) {
          guardrails.push(`${cleanSub}: ${sub.subBody.slice(0, 400).replace(/\s+/g, ' ').trim()}`);
          continue;
        }
        const subContent = sanitizeGuidelineTextForCustomer(sub.subBody.trim());
        if (subContent.length > 70) {
          const cleanSec = cleanHeadingTitle(sec.rawTitle);
          const title = cleanSub.toLowerCase().includes(cleanSec.toLowerCase())
            ? cleanSub
            : `${cleanSec}: ${cleanSub}`;
          articles.push({
            title,
            categoryName: catName,
            shortDescription: extractFirstSentence(subContent),
            content: `## ${title}\n\n${subContent}`,
            tags: extractKnowledgeTags(`${title} ${subContent}`, catName),
          });
        }
      }
    } else {
      // Remove any internalsubsections like "### Information to collect before escalation"
      const cleanedProse = sanitizeGuidelineTextForCustomer(
        proseBody.replace(
          /###\s+Information to collect before escalation[\s\S]*$/i,
          ''
        )
      );
      if (cleanedProse.length > 100) {
        articles.push({
          title: cleanSecTitle,
          categoryName: catName,
          shortDescription: extractFirstSentence(cleanedProse),
          content: `## ${cleanSecTitle}\n\n${cleanedProse}`,
          tags: extractKnowledgeTags(`${cleanSecTitle} ${cleanedProse}`, catName),
        });
      }
    }
  }

  // Update counts and prune empty categories
  for (const art of articles) {
    const c = categoriesMap.get(art.categoryName);
    if (c) c.articleCount++;
  }
  for (const f of faqs) {
    const c = categoriesMap.get(f.categoryName);
    if (c) c.faqCount++;
  }

  const categories = Array.from(categoriesMap.values()).filter(
    (c) => c.faqCount > 0 || c.articleCount > 0
  );
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return {
    documentTitle: docTitle,
    categories,
    articles,
    faqs,
    guardrails,
    summary: {
      totalCategories: categories.length,
      totalArticles: articles.length,
      totalFaqs: faqs.length,
      wordCount,
    },
  };
}

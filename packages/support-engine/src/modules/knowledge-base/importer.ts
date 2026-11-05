import {
  KnowledgeStatus,
  type KnowledgeArticle,
  type KnowledgeCategory,
  type KnowledgeFaq,
} from '@careflow/shared';

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

export function extractFirstSentence(text: string, fallback = 'Knowledge base guide.'): string {
  const clean = text
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
 * Intelligently extracts structured Categories, Q&A FAQs, and Help Articles.
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
            answer: f.answer.trim(),
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
          articles.push({
            title: a.title.trim(),
            categoryName: catName,
            shortDescription: a.shortDescription || extractFirstSentence(a.content),
            content: a.content.trim(),
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

  // Extract Document Title from first '# ' heading
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
    const catName = ensureCategory(sec.rawTitle);
    const body = sec.body;

    // Pattern for Q&A pairs (FAQs)
    // Matches:
    // - ### Q: <question>
    // - **Q:** <question>
    // - Q: <question>
    // followed by
    // - **A:** <answer>
    // - A: <answer>
    const faqPattern =
      /(?:###\s+Q:|\*\*Q:\*\*|^Q:)\s*([^\n\r]+)[\r\n]+(?:\*\*A:\*\*|^A:)\s*([\s\S]*?)(?=(?:[\r\n]+(?:###\s+Q:|\*\*Q:\*\*|^Q:|###\s+[^\n]+|##\s+[^\n]+))|$)/gim;

    let faqMatch: RegExpExecArray | null;
    const matchedFaqIndices: { start: number; end: number }[] = [];

    while ((faqMatch = faqPattern.exec(body)) !== null) {
      const q = faqMatch[1]!.replace(/\*\*|\*/g, '').trim();
      const a = faqMatch[2]!.replace(/^[\r\n]+|[\r\n]+$/g, '').trim();
      if (q && a) {
        faqs.push({
          question: q,
          answer: a,
          categoryName: catName,
        });
        matchedFaqIndices.push({ start: faqMatch.index, end: faqPattern.lastIndex });
      }
    }

    // Determine non-FAQ prose content
    let proseBody = body;
    for (let i = matchedFaqIndices.length - 1; i >= 0; i--) {
      const { start, end } = matchedFaqIndices[i]!;
      proseBody = proseBody.slice(0, start) + '\n\n' + proseBody.slice(end);
    }
    proseBody = proseBody.replace(/^---$/gm, '').trim();

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
      // Create articles for each distinct subsection with substantial content
      for (const sub of subSections) {
        const cleanSub = cleanHeadingTitle(sub.subTitle);
        const subContent = sub.subBody.trim();
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
    } else if (proseBody.length > 120) {
      // Single comprehensive article for this section's prose
      const cleanSecTitle = cleanHeadingTitle(sec.rawTitle);
      articles.push({
        title: cleanSecTitle,
        categoryName: catName,
        shortDescription: extractFirstSentence(proseBody),
        content: `## ${cleanSecTitle}\n\n${proseBody}`,
        tags: extractKnowledgeTags(`${cleanSecTitle} ${proseBody}`, catName),
      });
    }
  }

  // Update counts
  for (const art of articles) {
    const c = categoriesMap.get(art.categoryName);
    if (c) c.articleCount++;
  }
  for (const f of faqs) {
    const c = categoriesMap.get(f.categoryName);
    if (c) c.faqCount++;
  }

  const categories = Array.from(categoriesMap.values());
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return {
    documentTitle: docTitle,
    categories,
    articles,
    faqs,
    summary: {
      totalCategories: categories.length,
      totalArticles: articles.length,
      totalFaqs: faqs.length,
      wordCount,
    },
  };
}

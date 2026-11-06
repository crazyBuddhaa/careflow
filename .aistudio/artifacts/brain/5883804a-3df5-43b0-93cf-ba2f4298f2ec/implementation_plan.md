# Conversational Bot Upgrade & Guideline-Aware Response Engine

This update transforms the Telegram and Web support bots from static menu-and-keyword responders into natural, multi-turn conversational assistants. Opening a bot for the first time sends a clean, friendly greeting without button clutter, raw uploaded guideline documents are automatically separated into internal guardrails versus customer-facing answers, and broad or complex issues trigger natural clarifying questions and detail gathering before escalating to a human agent.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product behaviors have been confirmed from your preferences and will govern this implementation:

- **Confirmed Decision 1 — Natural First-Time Greeting (`/start`)**: When a customer opens the Telegram bot for the first time and taps **Start Bot** (`/start` or `/start <token>`), the bot treats it as an automated `"Hi"` and replies with a clean, friendly greeting (`"Hi there! How can {Business} help you today?"`) with **no category list and no inline menu buttons**. The `/menu` slash command remains available on demand.
- **Confirmed Decision 2 — Guideline Filtering & Clarifying Questions**: Regardless of how raw an uploaded knowledge base file is, internal instructions (such as *"Ask the customer to..."*, *"They should not send..."*, *"Escalate for..."*, or *"What the AI Must Not Claim"*) are never echoed verbatim to customers. Broad statements like *"I have an issue with my account"* or *"My product details is not correct"* trigger natural clarifying questions rather than mismatched keyword dumps.
- **Confirmed Decision 3 — Gather Details Before Escalation**: When an issue requires human verification or cannot be resolved from the knowledge base, the bot first asks the customer in chat for the relevant details (such as their account email, what specific detail or feature is affected, or transaction reference) and then escalates the enriched conversation to the human support queue.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Clean First-Time Bot Entry**: Replaces the wall of support topics and 9 inline keyboard buttons on `/start` with a natural conversational greeting identical to the web chat experience.
  2. **Guideline-Aware Importer & Response Sanitizer**: Distinguishes between *internal bot instructions/guardrails* and *customer-facing answers* both when importing a file and when generating live responses. Third-person agent instructions (`"Ask the customer to contact..."`, `"They should not send..."`, `"Escalate for..."`) are automatically converted into polite, second-person customer speech (`"Please contact..."`, `"For your security, please do not share..."`).
  3. **Multi-Turn Conversational State & Intent Disambiguation**: Tracks recent conversation messages across turns, responds naturally to pleasantries (`"How are you doing"`, `"Thanks"`), asks targeted clarifying questions when a customer makes a broad statement (`"I have an issue with my account"`), and collects required context before escalating to a human specialist.
- **Target Audience / Persona**: Customers reaching out on Telegram or the Website Chat Widget who expect a natural, helpful human-like chat experience, and business admins who upload raw internal support handbooks without wanting internal agent phrasing leaked to users.
- **Key Value**: Eliminates robotic menu walls, prevents embarrassing leaks of internal agent instructions, and resolves or triages customer issues through genuine back-and-forth dialogue.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **First-Time Bot Start (`/start`)**:
     - Customer opens the Telegram bot and taps **Start Bot**.
     - Bot immediately replies: `"Hi there! How can PunterStats help you today?"` (with no topic list and no inline keyboard buttons attached).
  2. **Casual Pleasantries & Small Talk**:
     - Customer: `"How are you doing"`
     - Bot: `"I'm doing well, thank you! How can I help you with PunterStats today?"` (instead of repeating the `"Hi there!"` greeting).
  3. **Broad / Ambiguous Customer Statements**:
     - Customer: `"I have an issue with my account"`
     - Bot recognizes `"account"` is a broad topic covering login, password reset, email verification, and subscription/billing, and asks: `"I'd be happy to help with your account! Are you having trouble signing in, resetting your password, verifying your email, or managing your subscription?"`
  4. **Guideline-Grounded Answers (No Raw Instruction Leaks)**:
     - If the customer says `"I made a payment but my plan didn't update"`, instead of outputting raw handbook text (`"Ask the customer to contact... Escalate for verification"`), the bot responds directly to the customer: `"I can help get your payment verified by our team. Could you please share your account email, approximate payment date/time, amount, payment provider, and transaction reference? (For your security, please never share your full card number, CVV, PIN, or OTP.)"`
  5. **Detail Gathering & Escalation**:
     - Customer replies with the requested details (or explains `"My product details is not correct"` -> bot asks which page/module or account detail is inaccurate -> customer provides details).
     - Once the customer provides the details (or asks for a human agent), the bot confirms and escalates the conversation to the human support queue with the full context attached.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean, modern conversational workspace (neutral slate `#0F172A`, crisp white `#FFFFFF` surfaces, semantic teal `#0D9488` and blue `#2563EB` accents).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for headings and chat interface controls; `JetBrains Mono` (`tabular-nums`) for timestamps and metrics; clean unboxed metadata separators (`·`) with zero decorative pill clutter in the admin preview modal.
  - *Knowledge Upload Modal Preview*: Displays whether sections from an uploaded file were categorized as **Customer Help Articles**, **Approved FAQs**, or **Bot Guardrails & Instructions** so admins have transparent visibility into how raw documents are processed.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Layer Guideline Sanitization (Import-Time + Runtime)**
  - *Chosen Approach*: Transform raw agent instructions into customer-facing phrasing during `parseKnowledgeDocument` **and** apply a runtime conversational voice filter in `answerPortalQuestion` + AI synthesis.
  - *Why*: If an admin already uploaded a raw markdown file earlier, runtime sanitization ensures existing database records immediately stop leaking *"Ask the customer to..."* phrasing even without re-uploading the file, while re-uploading also stores clean customer-ready answers and extracts bot guardrails into workspace chatbot instructions.
  - *Alternatives Considered*: Only sanitizing during file import (rejected because existing imported records in the database would still contain raw agent instructions).
- **Decision 2: Specificity Scoring & Conversational Clarification Before Answering**
  - *Chosen Approach*: Score query specificity and intent clarity before returning an FAQ or article. Single-noun or broad complaints (`"I have an issue with my account"`, `"My product details is not correct"`, `"It is not working"`) without a specific sub-intent trigger a conversational clarification prompt or AI-assisted multi-turn response rather than returning a low-precision keyword hit.
  - *Why*: In the current engine, stop-words like `"have"`, `"issue"`, `"with"`, `"not"`, `"correct"` or broad words like `"account"` score +3 on whichever FAQ happens to contain those words first, causing irrelevant answers (like telling a user to check their spam folder when they said *"My product details is not correct"*).
- **Decision 3: Two-Step Conversational Intake Before Human Escalation**
  - *Chosen Approach*: Maintain a lightweight conversational state (`awaiting_clarification` / `gathering_escalation_details`) in the session/conversation history. When a customer's issue cannot be answered from the knowledge base or requires account/payment lookup, the bot asks once for the key details needed by an agent, and upon the customer's next reply, escalates the conversation to `PendingHuman` with those details included.
  - *Why*: Prevents premature escalations on the first vague message while ensuring human agents receive actionable context.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Conversational Pipeline Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Telegram Bot / Web Widget / Support Portal               │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼                                                           ▼
┌─────────────────────────────────┐                       ┌──────────────────┐
│ First-Time Start (/start)       │                       │ Customer Message │
│ Treated as automated "Hi"       │                       │ + Chat History   │
│ -> Sends clean natural greeting │                       └─────────┬────────┘
│ -> No menu wall or buttons      │                                 │
└─────────────────────────────────┘                                 ▼
                                       ┌─────────────────────────────────────┐
                                       │ Conversational Intent & Guardrails  │
                                       │ 1. Pleasantries & Small Talk        │
                                       │    ("Hi", "How are you doing", etc) │
                                       │ 2. Broad Statement Detector         │
                                       │    ("issue with account" -> clarify)│
                                       │ 3. Stop-word filtered Semantic/FAQ  │
                                       │    Retrieval + Guideline Sanitizer  │
                                       │ 4. Gemini / AI Multi-Turn Synthesis │
                                       │    (Enforces "What NOT to say")     │
                                       │ 5. Pre-Escalation Detail Intake     │
                                       │    -> Escalate to Human Queue       │
                                       └─────────────────────────────────────┘
```

- **Data Model & State**:
  - **Session State (`TelegramCustomerSessionState` & Widget Conversation History)**:
    - Extend `TelegramCustomerSessionState` with optional `conversationStage?: 'active_chat' | 'awaiting_clarification' | 'awaiting_escalation_details'` and `pendingIssueTopic?: string`.
    - Pass recent messages from `activeConv.messages` (last 6 turns) into `answerPortalQuestion` so both deterministic and AI-assisted layers have full multi-turn context.
  - **Guideline & Instruction Separation (`importer.ts` & `d1-workspace-repository.ts`)**:
    - Detect meta-guideline sections in uploaded documents (`Instructions for CustomCare AI`, `Limitations / What the AI Must Not Claim`, `Sample Support Conversations`, `Source Pages`) so internal meta-rules populate the bot's guardrail instructions rather than polluting public customer articles.
    - Rewrite third-person agent directives (`"Ask the customer to..."`, `"Tell the user..."`, `"They should not send..."`, `"Escalate for..."`, `"Do not invent..."`) into natural customer-facing second-person prose.
- **Interactive Component & State Mapping**:
  - **Telegram `/start` & Greeting Handler (`d1-channel-service.ts`)**:
    - Update `handleTelegramCustomerStart` and `/start` handling in `handleTelegramCustomerMessage` so first-time bot start sends the clean conversational greeting (`"Hi there! How can {Business} help you today?"`) with no inline keyboard and sets `step: 'other_enquiry'`.
    - Separate `"How are you doing"` / `"How's it going"` from `"Hi"` in `classifyCustomerGreetingIntent` so each pleasantry receives a natural, distinct reply.
  - **Conversational Engine (`d1-workspace-repository.ts` & `knowledge-runtime.ts`)**:
    - Strip conversational filler/stop-words (`issue`, `problem`, `correct`, `working`, `details`, `with`, `have`, `want`, `know`, `more`, `about`) from keyword scoring so broad messages never match unrelated FAQs.
    - Add broad-intent detectors (e.g., general `"what is {business} / know more about {business}"` -> answers with Platform Overview; broad `"issue with my account"` -> asks clarifying question about login, verification, or subscription; broad `"details not correct / something wrong"` -> asks which specific feature or account detail is affected).
    - Upgrade the Gemini AI completion handler to use `@google/genai` with `gemini-3.8-flash`, multi-turn conversation history, and full workspace knowledge + guardrail rules so the bot holds natural multi-turn conversations and strictly obeys "what not to say" rules.

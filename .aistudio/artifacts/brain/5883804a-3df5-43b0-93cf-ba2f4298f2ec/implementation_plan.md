# CustomCare Dual-Mode Telegram Architecture: Instant Central Bot + Optional Branded Sub-Bots + Natural Greeting Recognition

Enable businesses to use **either or both** Telegram modes (`@getcustomcarebot` deep-link/QR code **and/or** an optional `@BotFather` Sub-Bot like `CD`), provide a **Business & Agent Hub** on `@getcustomcarebot`, and respond naturally whenever a customer simply says **"Hi"**, **"Hello"**, or **"Good morning"** instead of `/start`—greeting them by their Telegram first name (`Hi [Name]! 👋`) alongside the business's custom dashboard welcome message and interactive support buttons.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Natural Greeting Handling ("Hi", "Hello", "Hey" instead of `/start`):**
> - **On a Dedicated Business Sub-Bot (e.g., `CD` bot)**: Because the sub-bot belongs exclusively to that business, a customer does **not** even need to send `/start`. If their very first message is simply `"Hi"`, `"Hello"`, `"Hey"`, or `"Good afternoon"`, the bot immediately binds them to the business and replies naturally using their Telegram profile name (`first_name`) and the custom greeting configured in your dashboard—for example:
>   > *"Hi Alex! 👋 Welcome to CD Support. How can I help you today?"*
>   *(or using a `{name}` placeholder in your custom dashboard welcome message)*, followed by the interactive category buttons (`💳 Payment or Deposit Issues`, `📦 Product Support`, `⚙️ Technical Issues`, `💬 Other Enquiries`, `👤 Speak to an Agent`).
> - **On the Central Bot (`@getcustomcarebot` via Business Link)**: Once a customer has opened your business link (`?start=tg_<TOKEN>`), anytime they type `"Hi"`, `"Hello"`, `"Hey"`, or `"Good morning"` instead of `/start` or `/menu`, it responds with that exact same personalized greeting (`Hi [Name]! 👋 ...`) and interactive support menu instead of treating `"Hi"` as an unknown search query.
> - **Direct Natural Question First (e.g., `"Hi, my deposit is pending"`)**: If the customer combines a greeting with a real question in one message, the bot greets them by name **and** immediately answers or launches the relevant workflow (`Payment or Deposit Issues`) in a single natural response.

- **Confirmed Decision 1 — Dual Customer Access (Central Deep-Link + Optional Dedicated Sub-Bot)**:
  - Businesses never *have* to create a `@BotFather` bot—they can rely entirely on `@getcustomcarebot` via their instant deep-link/QR code.
  - Or they can optionally paste a `@BotFather` token (like `CD`) in `@getcustomcarebot` or the Web Dashboard so customers can chat with `@CD_bot` directly. Both can be active simultaneously.
- **Confirmed Decision 2 — Natural Conversational Greeting ("Hi" / "Hello" Support + `{name}` Personalization)**:
  - Both the Sub-Bot and Central Bot recognize conversational greetings (`hi`, `hello`, `hey`, `good morning`, `good afternoon`, `good evening`, `howdy`, `greetings`, `yo`, `help me`) and reply with the customer's Telegram first name + the business's custom dashboard greeting + the interactive category menu.
  - Businesses can also use `{name}` or `{business}` placeholders in their custom Welcome Message in the dashboard (e.g., `"Hi {name}! Welcome to {business}. How can we help you today?"`), and if `{name}` isn't explicitly in the template, CustomCare naturally prepends `"Hi [First Name]! 👋"` automatically.
- **Confirmed Decision 3 — Plain `/start` on `@getcustomcarebot` Opens the Business & Agent Hub**:
  - Business owners and agents messaging `@getcustomcarebot` directly get an interactive hub to connect their workspace, get their instant customer link, paste a Sub-Bot token, or manage live agent queues (`/queue`, `/active`, `/accept`, `/reply`, `/resolve`).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Natural Conversational Entry (`"Hi"` or `/start`)**:
     - Customers don't think in slash commands—many open a chat and type `"Hi"` or `"Hello"`.
     - CustomCare detects standalone greetings (`"Hi"`, `"Hello"`, `"Hey there"`, `"Good morning"`) as well as greeting-prefixed questions (`"Hi, how do I reset my password?"`):
       - **Standalone Greeting (`"Hi"`)**: Replies warmly with the customer's Telegram name (`Hi [Name]! 👋`), the business's custom dashboard welcome message, and the interactive category inline keyboard.
       - **Greeting + Question (`"Hi, I made a payment and it hasn't reflected"`)**: Greets the customer by name and immediately answers their question or routes into the matching support workflow.
  2. **Zero-BotFather Instant Mode (`@getcustomcarebot` Link/QR)**:
     - Ready out-of-the-box for every business without touching `@BotFather`.
  3. **Optional Branded Sub-Bot Mode (`@BotFather` Token, e.g., `CD` Bot)**:
     - Paste a `@BotFather` token in `@getcustomcarebot` or `/admin` -> CustomCare automatically sets up its serverless Cloudflare Worker webhook (`/api/webhooks/telegram/subbot/<integrationId>`) and commands so customers can message `@CD_bot` directly with `"Hi"` or `/start`.
  4. **Central Business & Agent Hub (`@getcustomcarebot`)**:
     - Dedicated onboarding and live ticket management hub for business owners and support agents.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Flow 1 — Customer Types `"Hi"` or `"Hello"` in the Business Bot (`CD` or Central Link)**:
   - Customer opens `CD` (or their connected `@getcustomcarebot` chat) and sends `"Hi"`.
   - Bot extracts `message.from.first_name` (e.g., `"David"`) and checks the business's configured `welcomeMessage` in D1.
   - Bot replies:
     ```
     Hi David! 👋

     Welcome to CD Support! Ask a question below or choose a support category to get instant assistance.

     How can we help you today?
     ```
     Followed by interactive inline buttons:
     - `[💳 Payment or Deposit Issues]` `[📦 Product Support]`
     - `[⚙️ Technical Issues]` `[💬 Other Enquiries]`
     - `[📂 My Active Conversations]` `[👤 Speak to an Agent]`
2. **Flow 2 — Customizing the Greeting in the Web Dashboard (`/admin` -> Channels & Integrations -> Telegram)**:
   - Business Admin can edit the **Customer Welcome & Greeting Message** field with support for dynamic variables `{name}` (customer's Telegram first name) and `{business}` (business name), plus a live preview showing how `"Hi"` or `/start` will look to customers.
3. **Flow 3 — Connecting a Sub-Bot (`CD`) via `@getcustomcarebot` or Web Dashboard**:
   - Paste the `@BotFather` token in either `@getcustomcarebot` (`🤖 Connect Business Sub-Bot`) or the Web Dashboard -> CustomCare verifies the bot via `getMe`, registers the serverless webhook and slash commands, and activates it immediately.

### Visual Identity & Dashboard Styling
- **Aesthetic Direction**: Enterprise SaaS workspace (`Plus Jakarta Sans` headings, `Public Sans` body, `JetBrains Mono` with `tabular-nums` for bot IDs, tokens, and webhook telemetry).
- **Color Palette & Surfaces**: Neutral slate canvas (`bg-slate-50` / `bg-white`), 1px structural borders (`border-slate-200`), emerald status indicators (`#16A34A`) paired with explicit text labels (`Active · Webhook Verified`), and zero nested card clutter.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Intent Classification for Conversational Greetings vs. Support Questions**
  - *Chosen Approach*: Add a fast, deterministic greeting recognizer (`classifyCustomerGreetingIntent`) before running KB search:
    - **Pure Greeting** (e.g., `"hi"`, `"hello"`, `"hey"`, `"good morning"`, `"hola"`, `"good day"`, `"hi there"`): Responds with the personalized `{name}` welcome message and full interactive support menu without polluting the ticket queue with an empty `"Hi"` escalation.
    - **Greeting + Question** (e.g., `"Hi, why is my withdrawal pending?"`): Strips the leading conversational filler for cleaner KB/FAQ matching while prepending `"Hi [Name]! 👋"` to the automated answer.
  - *Why*: Previously, sending `"Hi"` ran a full-text search for `"Hi"` in the knowledge base, found 0 articles, and immediately replied *"I couldn't find a verified answer for that... Would you like to speak with a human agent?"*—which feels robotic. Greeting the customer by name and presenting the business's custom welcome message + category menu feels natural and human.
- **Decision 2: Dynamic Serverless Sub-Bot Webhook Route (`/api/webhooks/telegram/subbot/[integrationId]`)**
  - *Chosen Approach*: Each connected sub-bot has its own serverless webhook URL on Cloudflare Workers so even if a brand-new customer opens `CD` and types `"Hi"` (without ever clicking `/start`), the Worker immediately knows the `organization_id` and replies as `CD`.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Dual-Mode Routing Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                       TELEGRAM SERVERLESS CLOUDFLARE WORKER                        │
├─────────────────────────────────────────┬──────────────────────────────────────────┤
│  MODE A: CENTRAL BOT (@getcustomcarebot)│  MODE B: OPTIONAL SUB-BOT (e.g. CD bot)  │
│  POST /api/webhooks/telegram            │  POST /api/webhooks/telegram/            │
│                                         │       subbot/[integrationId]             │
├─────────────────────────────────────────┼──────────────────────────────────────────┤
│ • Plain /start or "Hi" (Admin/Agent) -> │ • Plain /start OR "Hi" / "Hello" ->      │
│   Business & Agent Onboarding Hub       │   "Hi [Name]! 👋" + Custom Dashboard     │
│ • /start tg_<TOKEN> OR "Hi" (Customer)  │   Welcome Message + Category Buttons     │
│   -> "Hi [Name]! 👋" + Custom Dashboard │ • Guided Categories (Payment/Prod/Tech)  │
│   Welcome Message + Category Buttons    │ • Natural Language KB + AI Answers       │
│ • Natural Language KB + AI + Escalation │ • Photo/Document Uploads + Escalation    │
└────────────────────┬────────────────────┴────────────────────┬─────────────────────┘
                     │                                         │
                     └────────────────────┬────────────────────┘
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE D1 DATABASE (customcare-db)                         │
│ • channel_integrations: stores public_token (@getcustomcarebot link), custom       │
│   welcomeMessage (supports {name} & {business}), and optional customBotToken       │
│ • support_conversations & support_messages: unified across Web, Central & Sub-Bot  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Extensions
- **Greeting & Template Formatter (`formatPersonalizedCustomerWelcome`)**:
  - Resolves customer first name from Telegram `from.first_name` (fallback `"there"`).
  - Interpolates `{name}`, `{first_name}`, and `{business}` in `telegramConfig.welcomeMessage`, or automatically leads with `"Hi [First Name]! 👋"` when the customer greets the bot with `"Hi"` / `"Hello"` / `/start`.
- **Sub-Bot Configuration (`TelegramChannelConfig` & `ChannelIntegrationRecord`)**:
  - Stores `customBotToken` (masked in client responses as `customBotTokenMasked`), `customBotUsername`, `customBotId`, `customBotFirstName`, `customBotWebhookSecret`, and `customBotWebhookRegistered`.
- **Smart Outbound Bot Selection**:
  - Tracks whether a customer conversation is on the business's Sub-Bot (`source_channel_ref = 'subbot'`) or Central Bot (`source_channel_ref = 'central'`) so agent replies from Web or `@getcustomcarebot` always deliver through the exact bot the customer is chatting with.

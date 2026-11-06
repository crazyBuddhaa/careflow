# Implementation Plan: Telegram Mini App Agent Inbox & In-Conversation AI/KB Copilot

## 1. Architectural Overview

We will extend **CustomCare** with two interconnected capabilities from the Telegram Serverless & Agent Dashboard architecture:

1. **Telegram Mini App (`WebApp`) Agent Inbox with Cryptographic `initData` Auto-Login**:
   - Linked support agents and workspace admins can launch a dedicated, mobile- and desktop-optimized **Telegram Mini App** (`/tg-app`) directly from a **`web_app` button** inside the Telegram bot (`@getcustomcarebot` or their business's `@BotFather` sub-bot) or from escalation notifications.
   - When opened inside Telegram, `window.Telegram.WebApp.initData` is sent to the backend (`/api/telegram/miniapp/session`), which cryptographically validates the Telegram signature using `HMAC-SHA256("WebAppData", botToken)` (supporting both the central bot token and any active dedicated business sub-bot token) and resolves the linked agent's approved `telegram_agent_links` + `organization_members` record.
   - Upon verification, the Mini App automatically logs the agent into their unified inbox (and sets an authenticated session cookie) so they can filter queues (`Open`, `Unassigned`, `My Assigned`, `Escalated`, `Resolved`), switch across multiple linked businesses, claim/assign conversations, add private internal notes, use KB/AI draft assistance, and send bot-mediated replies without typing passwords on mobile.

2. **In-Conversation Knowledge Base Search & 1-Click AI Draft Reply Copilot**:
   - Inside both the main Web **Conversation Workspace** (`WorkspaceOperationsManager.tsx`) and the **Telegram Mini App** (`/tg-app`), agents get an integrated **AI & Knowledge Copilot** panel alongside the conversation composer.
   - **1-Click AI Draft Reply**: Analyzes the selected customer conversation transcript against the organization's published Knowledge Base, FAQs, and troubleshooting procedures to generate a grounded, ready-to-review draft reply. Clicking **"Insert into Composer"** populates the reply box so the agent can review, edit, and send it (never auto-sending without agent confirmation).
   - **Live In-Conversation KB Search**: Agents can search published articles and FAQs by keyword without leaving the conversation and insert any verified answer or snippet into the composer with one click.

---

## 2. Planned Changes by Module

### A. Cryptographic Telegram Mini App Authentication & Bot `web_app` Launcher (`/packages/database/src/d1-channel-service.ts`)
- **Telegram `WebApp` Button Support**:
  - Extend `TelegramInlineKeyboardButton` to support `web_app?: { url: string }`.
  - Include a **📱 Open Agent Dashboard (Mini App)** `web_app` button (`https://.../tg-app`) in:
    - The Agent Hub welcome/menu screen (`/start`, `/help`, `/queue` on `@getcustomcarebot`).
    - Real-time escalation notifications (`notifyLinkedAgentsOfEscalation`) so agents can tap once on an alert to open that conversation directly in the Mini App (`/tg-app?conversationId=<id>`).
- **Server-Side `initData` HMAC-SHA256 Verification (`verifyTelegramMiniAppInitData`)**:
  - Parse the raw `initData` query string (`hash`, `auth_date`, `user`), sort all key-value pairs alphabetically (excluding `hash`), join with `\n`, and compute:
    - `secretKey = HMAC_SHA256(key: "WebAppData", data: botToken)`
    - `expectedHash = HMAC_SHA256(key: secretKey, data: dataCheckString)`
  - Validate against the central `TELEGRAM_BOT_TOKEN` as well as any active encrypted `@BotFather` sub-bot tokens in `channel_integrations`.
  - Enforce freshness (`auth_date` within 24 hours) and timing-safe hex comparison.
  - Resolve the verified `telegramUserId` against `telegram_agent_links` (`status = 'linked'`) and active `organization_members`, returning the authenticated `CareFlowUserRecord`, active workspace membership, and linked agent profile.

### B. Backend API Endpoints for Mini App Auth & Agent AI/KB Copilot (`/apps/web/src/app/api/...`)
- **`POST /api/telegram/miniapp/session`** (`/apps/web/src/app/api/telegram/miniapp/session/route.ts`):
  - Accepts `{ initData: string, organizationId?: string }`.
  - Calls `channelService.authenticateTelegramMiniAppAgent({ initData, centralBotToken, preferredOrganizationId })`.
  - Issues a signed CustomCare session cookie (`setSessionCookie`) and returns the agent's user profile, linked workspaces, active organization, and agent availability status.
- **`POST /api/workspace/conversations/[id]/copilot`** (`/apps/web/src/app/api/workspace/conversations/[id]/copilot/route.ts`):
  - Authenticated agent/admin endpoint for the active workspace.
  - Supports two actions:
    1. `action: 'suggest_reply'`: Uses the conversation's recent customer messages + `workspaceRepo.answerPortalQuestion` / `KnowledgeManagementService.retrievePublishedKnowledge` to generate a grounded draft reply, returning `{ suggestedReply, matchedSourceTitle, resolutionLayer, relevantSnippets }`.
    2. `action: 'search_kb'`: Searches the organization's published FAQs and Knowledge Base articles for `query` (or defaults to the conversation's subject/category) and returns ranked articles and FAQs ready for 1-click insertion into the reply composer.

### C. In-Conversation KB Search & AI Reply Copilot in Web Workspace (`/apps/web/src/components/admin/WorkspaceOperationsManager.tsx`)
- Enhance the **Conversation Workspace** (right-hand context & tools column next to the message composer) with an interactive **AI & Knowledge Base Copilot** section:
  - **"✨ Generate AI Draft Reply" button**: Fetches a grounded draft based on the customer's latest message in the thread, displays the suggested response with its source citation badge, and provides **"Insert into Reply"** and **"Regenerate"** actions.
  - **Inline Knowledge Base Search**: Search input to query deposit troubleshooting, product instructions, or FAQs in real time without leaving the conversation, with a **"Use Answer"** button on each result that inserts the text directly into the agent's composer.

### D. Standalone & Embedded Telegram Mini App Interface (`/apps/web/src/app/tg-app/page.tsx`)
- Create `/tg-app`, a responsive, touch-friendly **Telegram Mini App Agent Dashboard** that:
  - Loads the official `https://telegram.org/js/telegram-web-app.js` bridge (calling `Telegram.WebApp.ready()` and `Telegram.WebApp.expand()`).
  - Auto-authenticates via `POST /api/telegram/miniapp/session` when launched inside Telegram, or falls back to the active CustomCare web session when opened in a desktop/mobile browser.
  - Displays:
    - **Agent Top Bar**: Agent name, `@username`, active business selector (for multi-business agents), and 1-tap availability toggle (`Available`, `Busy`, `Offline`).
    - **KPI Summary Strip**: Open, Unassigned, My Active, Escalated, and Resolved counts.
    - **Unified Inbox & Conversation Workspace**: Filterable queue list + full conversation thread, 1-click **Claim / Assign**, **Resolve / Reopen**, **Public Reply vs. Private Internal Note** toggle, and the **AI Draft Reply & KB Search Copilot** drawer.

---

## 3. Verification & Testing Plan
- Add automated tests in `/tests/multichannel-support-os.test.ts` covering:
  1. Cryptographic `initData` HMAC-SHA256 generation and verification (`authenticateTelegramMiniAppAgent`), including rejection of tampered hashes and unlinked Telegram users.
  2. Agent Hub `/start` and escalation notifications including the `web_app` Mini App launcher button.
  3. In-conversation KB search & AI reply suggestion generation grounded in the organization's knowledge base.
- Run `npm test`, `compile_applet`, and `lint_applet` to ensure zero build or type errors.

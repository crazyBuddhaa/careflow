# CareFlow Web Widget (`@careflow/widget`)

Embeddable web customer support launcher for **CareFlow**.

## Architectural Role
- Shares the exact same `ChannelConversationGatewayPort` and REST intake routes as the Telegram channel adapter.
- Uses `@careflow/shared` and `@careflow/validation` contracts to guarantee type-safe communication with `apps/web` Route Handlers.
- Full customer messaging UI and real-time socket binding are scheduled for v0.2+.

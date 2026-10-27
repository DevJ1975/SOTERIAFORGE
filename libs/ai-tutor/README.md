# @assurance/ai-tutor

Angular library providing the RAG AI Tutor client service and chat UI component.

## Tenant Isolation — CRITICAL

**Tenant isolation is authoritative server-side.**

The `TutorChatComponent` accepts `tenantId` and `uid` as required signal inputs and forwards them to `TutorService.ask()`, which passes them to the Forge API's coach endpoint. The API:

1. **Verifies the caller's session token** and reads the tenant from the authenticated member — this is the authoritative source used for all vector retrieval filtering.
2. **Ignores the client-supplied `tenantId`** for any security decision. The client value is a convenience hint only; a malicious client cannot escalate to another tenant's data by manipulating the field.
3. **Filters all RAG vector chunk retrieval by the authenticated tenant**, ensuring that no tenant can ever observe knowledge from another tenant's knowledge base.

In short: the server's authenticated tenant is authoritative; the client's `tenantId` is never trusted for security decisions.

## Citations

Assistant messages include `citations` — an array of `{ sourceId, label?, moduleId? }` objects pointing back to the grounding knowledge chunks used to generate the answer. The `TutorChatComponent` renders these as chips below each assistant message.

## Usage

The service uses `HttpClient` with `ASSURANCE_ENV.apiBaseUrl`; provide `provideHttpClient()` (with the Forge auth interceptor) in `app.config.ts`.

```html
<!-- In your template, after resolving tenantId and uid from auth -->
<forge-tutor-chat [tenantId]="tenantId()" [uid]="uid()" />
```

## Exports

- `TutorService` — injectable service holding `messages` and `pending` signals; `ask(question, ctx)` drives the conversation.
- `TutorChatComponent` — standalone `OnPush` component with selector `forge-tutor-chat`.

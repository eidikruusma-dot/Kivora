---
name: Chat message edit and delete
description: Architecture for editing and deleting AI chat messages in Firestore and the UI.
---

## Firestore pattern
Messages are stored as an array inside the parent Chat document (`users/{uid}/aiConversations/{chatId}`).
There is no per-message sub-collection. All edits/deletes rewrite the whole Chat via `saveChat`.

## Store functions added (aiConversationsStore.ts)
- `updateChatMessage(chatId, messageId, { content })` — updates one message, optimistic local emit
- `deleteChatMessage(chatId, messageId)` — removes one message
- `deleteMessagesFrom(chatId, messageId)` — removes that message and all later ones (cascade)

## UI rules
- User messages: Edit + Delete buttons appear on hover (CSS `group-hover:opacity-100`)
- Assistant messages: Delete only (editing AI text not required)
- Editing an older message with later AI responses → warns user and deletes cascade after confirm
- After cascade: edited text pre-populated back into the composer so user can resend
- `hiddenContext` and `actions` are never exposed or editable — only `content` field

## Defensive JSON parser
`safeContent(content: string)` in AIAssistantPage.tsx:
If assistant message content is accidentally stored as `{ "reply": "...", "actions": [...] }`,
extract just `reply` before rendering. Prevents raw JSON leak to the user.

## How to apply
Never allow raw JSON wrapper to be stored in `ChatMessage.content`.
The defensive parser is a safety net only — `fetchAIReply` should always extract `data.reply`.

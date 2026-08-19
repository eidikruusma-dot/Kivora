/**
 * entityLinks.ts
 *
 * Shared types for Kivora's unified cross-module linking system.
 * Every major item type can be linked to items in other modules via EntityLink.
 *
 * Firestore path: users/{uid}/entityLinks/{linkId}
 */

export type EntityType = 'task' | 'calendar' | 'note' | 'habit' | 'goal' | 'school' | 'ai'

export type RelationType =
  | 'related'      // generic relation
  | 'scheduled'    // this item is scheduled on a calendar event
  | 'supports'     // this item supports / contributes to the other
  | 'createdFrom'  // this item was created from / based on the other
  | 'belongsTo'    // this item belongs to / is part of the other

export interface EntityLink {
  id: string
  fromType: EntityType
  fromId: string
  toType: EntityType
  toId: string
  relationType: RelationType
  createdAt: number   // ms since epoch
  updatedAt: number   // ms since epoch
}

// School entity IDs are compound: "${kind}:${rawId}"
// kind is one of: task | exam | subject | lesson
// e.g. "task:42" or "exam:7"
export type SchoolEntityKind = 'task' | 'exam' | 'subject' | 'lesson'

export function encodeSchoolId(kind: SchoolEntityKind, rawId: string | number): string {
  return `${kind}:${rawId}`
}

export function decodeSchoolId(encodedId: string): { kind: SchoolEntityKind; rawId: string } | null {
  const sep = encodedId.indexOf(':')
  if (sep === -1) return null
  const kind = encodedId.slice(0, sep) as SchoolEntityKind
  const rawId = encodedId.slice(sep + 1)
  if (!['task', 'exam', 'subject', 'lesson'].includes(kind)) return null
  return { kind, rawId }
}

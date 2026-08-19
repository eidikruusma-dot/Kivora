/**
 * firestoreUtils.ts
 *
 * Shared Firestore helper utilities.
 */

/**
 * Recursively remove every key whose value is `undefined` from an object
 * (or array of objects) so Firestore never rejects the payload with
 * "Unsupported field value: undefined".
 *
 * - Plain values (string, number, boolean, null) are returned as-is.
 * - Arrays are recursively cleaned element-by-element.
 * - Objects have every `undefined`-valued key stripped, then their
 *   remaining values are cleaned recursively.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestore) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v)
      }
    }
    return cleaned as T
  }
  return value
}

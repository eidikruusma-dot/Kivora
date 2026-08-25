import { auth } from '@/lib/firebase'

/**
 * Thrown by authenticatedFetch when there is no signed-in Firebase user.
 * A stable, checkable error (name + message are both the fixed string
 * "AUTH_REQUIRED") — never a fetch/network error, since no request is ever
 * made in this case.
 */
export class AuthRequiredError extends Error {
  constructor() {
    super('AUTH_REQUIRED')
    this.name = 'AuthRequiredError'
  }
}

/**
 * The one shared entry point for calling Kivora's paid, OpenAI-backed API
 * routes from the frontend. Every existing request option (method, body,
 * any other init field) and the caller's own response handling are passed
 * through unchanged — this only adds one thing: an `Authorization: Bearer
 * <Firebase ID token>` header, obtained from the currently signed-in user.
 *
 * - No signed-in user → throws AuthRequiredError before any network call.
 * - Token retrieval failure (auth.currentUser.getIdToken() rejects) →
 *   propagates as a normal rejected promise, also before any network call,
 *   since `fetch` is only ever reached after the token is in hand.
 * - Headers are merged via the Headers API, so any header the caller
 *   already set (e.g. "Content-Type": "application/json") survives
 *   untouched. Authorization is the only header this function ever sets
 *   itself — Content-Type for a FormData body is deliberately never
 *   touched here, so the browser can add its own multipart boundary.
 * - Never logs the token, the request body, uploaded document contents, or
 *   any user data.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new AuthRequiredError()
  }

  const token = await user.getIdToken()

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  return fetch(input, { ...init, headers })
}

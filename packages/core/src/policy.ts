/**
 * Shared constants that both the server and the browser need.
 *
 * These live in @acct/core rather than @acct/auth on purpose: core is pure
 * and has no database dependency, so a client component can import it
 * without pulling the libSQL driver into the browser bundle.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 1024;

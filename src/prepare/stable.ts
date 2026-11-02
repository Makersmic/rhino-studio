/** For a computed() that builds a small plain object: returning the old object tells Vue that nothing changed. */
export function sameIfEqual<T>(previous: T | undefined, next: T): T {
  return previous !== undefined && JSON.stringify(previous) === JSON.stringify(next) ? previous : next
}

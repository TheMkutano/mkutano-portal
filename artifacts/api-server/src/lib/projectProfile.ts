/** A null snapshot means a legacy link; never write to the shared identity. */
export function projectProfile<T extends { id: string }>(identity: T, snapshot: Partial<T> | null | undefined): T {
  return { ...identity, ...snapshot, id: identity.id };
}
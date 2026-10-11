/**
 * MYNH ERP V5 — table column preference normalization (P0).
 * Pure, DOM-free and non-destructive. The calling hook owns storage/events.
 * Existing column order and visibility win over new defaults.
 */
export type TableColumnPreferences<K extends string> = {
  order: K[]
  hidden: K[]
}

export function normalizeTableColumnPreferences<K extends string>(
  saved: unknown,
  all: readonly K[],
  locked: readonly K[] = [],
  insertNewAfter: Partial<Record<K, K>> = {},
): TableColumnPreferences<K> {
  const order: K[] = []
  const visibleKeys = new Set(all)
  const lockedKeys = new Set(locked)
  const data = saved !== null && typeof saved === 'object' && !Array.isArray(saved)
    ? saved as {order?:unknown,hidden?:unknown}
    : null

  if (Array.isArray(data?.order)) {
    for (const key of data.order) {
      if (typeof key !== 'string' || !visibleKeys.has(key as K)) continue
      if (!order.includes(key as K)) order.push(key as K)
    }
  }

  // Preserve the previously chosen relative order. Put a newly added column
  // beside its existing semantic neighbor rather than always appending it.
  for (const key of all) {
    if (order.includes(key)) continue
    const anchor = insertNewAfter[key]
    const position = anchor ? order.indexOf(anchor) : -1
    if (position >= 0) order.splice(position + 1, 0, key)
    else order.push(key)
  }

  const hidden: K[] = []
  if (Array.isArray(data?.hidden)) {
    for (const key of data.hidden) {
      if (typeof key !== 'string' || !visibleKeys.has(key as K)) continue
      if (lockedKeys.has(key as K) || hidden.includes(key as K)) continue
      hidden.push(key as K)
    }
  }

  // A stale or corrupted saved configuration must never hide every column.
  if (all.length > 0 && hidden.length >= all.length) {
    hidden.splice(hidden.indexOf(order[0]), 1)
  }
  return {order,hidden}
}


/**
 * Legacy Purchase tables use TWO separate arrays in localStorage:
 * visible-column keys and column-order keys. Keep these original keys;
 * normalize only the content so no existing user's settings are discarded.
 */
export function normalizeLegacyVisibleColumns<K extends string>(
  saved: unknown,
  all: readonly K[],
  locked: readonly K[],
): K[] {
  if (!Array.isArray(saved)) return [...all]
  const valid: K[] = []
  for (const value of saved) {
    if (typeof value !== 'string' || !all.includes(value as K) || valid.includes(value as K)) continue
    valid.push(value as K)
  }
  if (!valid.length) return [...all]
  // Preserve the old array order wherever possible; restore only required keys.
  for (const key of locked) {
    if (all.includes(key) && !valid.includes(key)) valid.unshift(key)
  }
  return valid
}

export function normalizeLegacyColumnOrder<K extends string>(
  saved: unknown,
  all: readonly K[],
): K[] {
  if (!Array.isArray(saved)) return [...all]
  return normalizeTableColumnPreferences({order:saved},all).order
}

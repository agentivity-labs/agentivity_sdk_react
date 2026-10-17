/**
 * A single Data Table row. `id`/`createdAt`/`updatedAt` are system columns present
 * on every row (see the backend's `DataTableRow.ToDictionary()`); every other key
 * is a user-defined column, typed per the table's schema (managed in Studio).
 */
export interface DataTableRow {
  id: number;
  createdAt: string;
  updatedAt: string;
  [column: string]: unknown;
}

/** One condition of a Data Table search: `op` is one of `=`, `!=`, `contains`, `starts_with`, `>`, `>=`, `<`, `<=`, `between` (`value: [low, high]`), `is_empty`, `is_not_empty` (no `value`). */
export interface DataTableCondition {
  column: string;
  op: string;
  value?: unknown;
}

/** One page of a Data Table search: its rows, where it starts, and how many rows the search found in all. */
export interface DataTableRowsPage {
  rows: DataTableRow[];
  total: number;
  offset: number;
  hasMore: boolean;
}

export function parseDataTableRow(json: Record<string, unknown>): DataTableRow {
  const { id, createdAt, updatedAt, ...rest } = json;
  return {
    id: typeof id === 'number' ? id : Number(id),
    createdAt: String(createdAt ?? ''),
    updatedAt: String(updatedAt ?? ''),
    ...rest,
  };
}

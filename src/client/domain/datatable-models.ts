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

export function parseDataTableRow(json: Record<string, unknown>): DataTableRow {
  const { id, createdAt, updatedAt, ...rest } = json;
  return {
    id: typeof id === 'number' ? id : Number(id),
    createdAt: String(createdAt ?? ''),
    updatedAt: String(updatedAt ?? ''),
    ...rest,
  };
}

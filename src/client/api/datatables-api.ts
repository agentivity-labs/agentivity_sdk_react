import { AgentivityHttpCore } from '../http-core.js';
import { parseDataTableRow, type DataTableCondition, type DataTableRow, type DataTableRowsPage } from '../domain/datatable-models.js';

/**
 * Row-level access to shared Data Table assets — `/api/v1/datatables/{id}/rows`.
 *
 * **Scope**: rows only (list/insert/update/delete), matching {@link AgentivityClient}'s
 * app-runtime boundary. Defining a table's schema, browsing/moving it between
 * folders, and versioning are Studio (admin) concerns and deliberately not
 * exposed here — same reasoning as workflows/agents/teams/credentials.
 *
 * This is how an app reads data a Team's workflow wrote to a shared table (e.g.
 * a `trips` table the Trip Manager populates, that a "Mes voyages" screen lists
 * directly — no agent run needed just to display it) and, where the app owns
 * the write (not an agent), writes back to it.
 */
export class DataTablesApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /** `GET /api/v1/datatables/{id}/rows` — all rows, or rows matching one `where` column/value. */
  async listRows(tableId: string, args?: { whereColumn?: string; whereValue?: string }): Promise<DataTableRow[]> {
    const normalized = this.c.requireNormalizedId(tableId, 'Data Table id');
    const data = await this.c.get<Record<string, unknown>[]>(AgentivityHttpCore.v1(`/datatables/${normalized}/rows`), {
      query: { whereColumn: args?.whereColumn, whereValue: args?.whereValue },
    });
    return (data ?? []).map(parseDataTableRow);
  }

  /**
   * `GET /api/v1/datatables/{id}/rows` — one page of a search: the rows meeting every condition of `where` (`between` takes
   * `[low, high]`), sorted by `orderBy` (`'amount desc, customer'`), from `offset`, at most `limit` of them — with the total the
   * platform found, so that a page is never taken for the whole table. The search is done by the platform's database.
   */
  async listRowsPage(tableId: string, args?: { where?: DataTableCondition[]; orderBy?: string; limit?: number; offset?: number }): Promise<DataTableRowsPage> {
    const normalized = this.c.requireNormalizedId(tableId, 'Data Table id');
    const offset = args?.offset ?? 0;
    const { data, headers } = await this.c.getWithHeaders<Record<string, unknown>[]>(AgentivityHttpCore.v1(`/datatables/${normalized}/rows`), {
      query: {
        where: args?.where && args.where.length > 0 ? JSON.stringify(args.where) : undefined,
        orderBy: args?.orderBy?.trim() || undefined,
        limit: args?.limit,
        offset: offset > 0 ? offset : undefined,
      },
    });
    const rows = (data ?? []).map(parseDataTableRow);
    const total = Number.parseInt(headers.get('X-Total-Count') ?? '', 10);
    const found = Number.isNaN(total) ? offset + rows.length : total;
    return { rows, total: found, offset, hasMore: offset + rows.length < found };
  }

  /** `POST /api/v1/datatables/{id}/rows` — inserts a row, returns it with its assigned `id`. */
  async insertRow(tableId: string, data: Record<string, unknown>): Promise<DataTableRow> {
    const normalized = this.c.requireNormalizedId(tableId, 'Data Table id');
    const result = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/datatables/${normalized}/rows`), data);
    return parseDataTableRow(result ?? {});
  }

  /** `PUT /api/v1/datatables/{id}/rows/{rowId}` — merges `data` into the row's columns. */
  async updateRow(tableId: string, rowId: number, data: Record<string, unknown>): Promise<DataTableRow> {
    const normalized = this.c.requireNormalizedId(tableId, 'Data Table id');
    const result = await this.c.put<Record<string, unknown>>(AgentivityHttpCore.v1(`/datatables/${normalized}/rows/${rowId}`), data);
    return parseDataTableRow(result ?? {});
  }

  /** `DELETE /api/v1/datatables/{id}/rows/{rowId}` */
  async deleteRow(tableId: string, rowId: number): Promise<void> {
    const normalized = this.c.requireNormalizedId(tableId, 'Data Table id');
    await this.c.delete<void>(AgentivityHttpCore.v1(`/datatables/${normalized}/rows/${rowId}`));
  }
}

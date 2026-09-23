/**
 * AG-UI Bundle models (EPIC-0445).
 *
 * Summary list: `GET /api/v1/ag-ui/bundles`
 * Detail:       `GET /api/v1/ag-ui/bundles/{bundleId}`
 */

export interface AgUiBundleSummary {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  widgetCount: number;
}

export function parseAgUiBundleSummary(json: Record<string, unknown>): AgUiBundleSummary {
  return {
    id: typeof json['id'] === 'string' ? json['id'] : '',
    displayName: typeof json['displayName'] === 'string' ? json['displayName'] : '',
    version: typeof json['version'] === 'string' ? json['version'] : '',
    description: typeof json['description'] === 'string' ? json['description'] : undefined,
    widgetCount: typeof json['widgetCount'] === 'number' ? Math.trunc(json['widgetCount']) : 0,
  };
}

export interface AgUiBundleWidget {
  typeKey: string;
  category?: string;
  description?: string;
}

export function parseAgUiBundleWidget(json: Record<string, unknown>): AgUiBundleWidget {
  return {
    typeKey: typeof json['typeKey'] === 'string' ? json['typeKey'] : '',
    category: typeof json['category'] === 'string' ? json['category'] : undefined,
    description: typeof json['description'] === 'string' ? json['description'] : undefined,
  };
}

export interface AgUiBundleDetail {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  widgets: AgUiBundleWidget[];
}

export function parseAgUiBundleDetail(json: Record<string, unknown>): AgUiBundleDetail {
  const rawWidgets = json['widgets'];
  const widgets = Array.isArray(rawWidgets) ? rawWidgets.filter((w): w is Record<string, unknown> => !!w && typeof w === 'object').map(parseAgUiBundleWidget) : [];
  return {
    id: typeof json['id'] === 'string' ? json['id'] : '',
    displayName: typeof json['displayName'] === 'string' ? json['displayName'] : '',
    version: typeof json['version'] === 'string' ? json['version'] : '',
    description: typeof json['description'] === 'string' ? json['description'] : undefined,
    widgets,
  };
}

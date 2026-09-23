/** Shared JSON parsing utilities — port of `json_helpers.dart`, case-insensitive key lookup. */

export function jsonLookup(json: Record<string, unknown>, key: string): unknown {
  if (key in json) return json[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(json)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function jsonStr(json: Record<string, unknown>, key: string): string {
  const v = jsonLookup(json, key);
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (v != null) {
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return '';
}

export function jsonOpt(json: Record<string, unknown>, key: string): string | undefined {
  const v = jsonLookup(json, key);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

export function jsonBool(json: Record<string, unknown>, key: string): boolean {
  const v = jsonLookup(json, key);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase();
    return n === 'true' || n === '1';
  }
  return false;
}

export function jsonInt(json: Record<string, unknown>, key: string): number | undefined {
  const v = jsonLookup(json, key);
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

export function jsonDateTime(json: Record<string, unknown>, key: string): Date | undefined {
  const v = jsonLookup(json, key);
  if (v == null) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export function jsonMap(json: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = jsonLookup(json, key);
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : undefined;
}

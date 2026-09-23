/**
 * RFC 6902 JSON Patch — internal utility shared by `AgUiStateController` and
 * `AgUiActivityController`. Port of `json_patch.dart`. Not exported from the
 * package barrel — import from `@agentivity-labs/sdk-react` re-exports only
 * where a consumer-facing use exists.
 */

interface PatchOp {
  op?: string;
  path?: string;
  from?: string;
  value?: unknown;
  [key: string]: unknown;
}

function segments(path: string): string[] {
  if (path === '' || path === '/') return [];
  return path.slice(1).split('/').map(unescapeSegment);
}

function unescapeSegment(s: string): string {
  return s.replaceAll('~1', '/').replaceAll('~0', '~');
}

function deepCopy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(deepCopy);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepCopy(val);
    return out;
  }
  return v;
}

function get(node: unknown, path: string): unknown {
  let current = node;
  for (const seg of segments(path)) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[seg];
    } else if (Array.isArray(current)) {
      const i = Number.parseInt(seg, 10);
      if (Number.isNaN(i) || i < 0 || i >= current.length) return undefined;
      current = current[i];
    } else {
      return undefined;
    }
  }
  return current;
}

function setAt(node: unknown, segs: string[], value: unknown, add: boolean): unknown {
  if (segs.length === 0) return deepCopy(value);

  const [key, ...rest] = segs as [string, ...string[]];

  if (Array.isArray(node)) {
    const copy = [...node];
    if (key === '-' && add) {
      copy.push(setAt(undefined, rest, value, add));
    } else {
      const i = Number.parseInt(key, 10);
      if (!Number.isNaN(i)) {
        if (add && i >= 0 && i <= copy.length) {
          copy.splice(i, 0, setAt(undefined, rest, value, add));
        } else if (!add && i >= 0 && i < copy.length) {
          copy[i] = setAt(copy[i], rest, value, add);
        }
      }
    }
    return copy;
  }

  if (node && typeof node === 'object') {
    const copy = { ...(node as Record<string, unknown>) };
    copy[key] = setAt(copy[key], rest, value, add);
    return copy;
  }

  if (rest.length === 0) return { [key]: deepCopy(value) };
  return { [key]: setAt(undefined, rest, value, add) };
}

function set(doc: Record<string, unknown>, path: string, value: unknown, add: boolean): Record<string, unknown> {
  const segs = segments(path);
  if (segs.length === 0) {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : doc;
  }
  return setAt({ ...doc }, segs, value, add) as Record<string, unknown>;
}

function removeAt(node: unknown, segs: string[]): unknown {
  if (segs.length === 0) return node;
  const [key, ...rest] = segs as [string, ...string[]];

  if (Array.isArray(node)) {
    const copy = [...node];
    const i = Number.parseInt(key, 10);
    if (!Number.isNaN(i) && i >= 0 && i < copy.length) {
      if (rest.length === 0) {
        copy.splice(i, 1);
      } else {
        copy[i] = removeAt(copy[i], rest);
      }
    }
    return copy;
  }

  if (node && typeof node === 'object') {
    const copy = { ...(node as Record<string, unknown>) };
    if (rest.length === 0) {
      delete copy[key];
    } else if (key in copy) {
      copy[key] = removeAt(copy[key], rest);
    }
    return copy;
  }

  return node;
}

function remove(doc: Record<string, unknown>, path: string): Record<string, unknown> {
  const segs = segments(path);
  if (segs.length === 0) return {};
  return removeAt({ ...doc }, segs) as Record<string, unknown>;
}

function applyOp(doc: Record<string, unknown>, op: string, path: string, raw: PatchOp): Record<string, unknown> {
  switch (op) {
    case 'add':
      return set(doc, path, raw.value, true);
    case 'remove':
      return remove(doc, path);
    case 'replace':
      return set(doc, path, raw.value, false);
    case 'move': {
      if (!raw.from) return doc;
      const value = get(doc, raw.from);
      return set(remove(doc, raw.from), path, value, true);
    }
    case 'copy': {
      if (!raw.from) return doc;
      return set(doc, path, get(doc, raw.from), true);
    }
    default:
      return doc;
  }
}

/** Applies a list of RFC 6902 JSON Patch operations to `doc`. Best-effort: invalid ops are skipped. */
export function applyJsonPatch(doc: Record<string, unknown>, ops: unknown[]): Record<string, unknown> {
  let current = deepCopy(doc) as Record<string, unknown>;
  for (const rawOp of ops) {
    if (!rawOp || typeof rawOp !== 'object') continue;
    const op = rawOp as PatchOp;
    if (!op.op || !op.path) continue;
    try {
      current = applyOp(current, op.op, op.path, op);
    } catch {
      // Best-effort: skip invalid operations.
    }
  }
  return current;
}

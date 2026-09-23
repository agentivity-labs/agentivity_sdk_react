import { jsonDateTime, jsonInt, jsonLookup, jsonMap, jsonOpt, jsonStr } from '../../shared/json-helpers.js';

export type FormRequestKind = 'input' | 'approval' | 'choice' | 'notification';

export function formRequestKindFromApi(raw: string): FormRequestKind {
  switch (raw.trim().toLowerCase()) {
    case 'approval':
      return 'approval';
    case 'choice':
      return 'choice';
    case 'notification':
      return 'notification';
    default:
      return 'input';
  }
}

export type FormFieldType = 'text' | 'multilineText' | 'number' | 'boolean' | 'choice' | 'date' | 'file';

export function formFieldTypeFromApi(raw: string): FormFieldType {
  switch (raw.trim().toLowerCase()) {
    case 'multilinetext':
      return 'multilineText';
    case 'number':
      return 'number';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'choice':
      return 'choice';
    case 'date':
      return 'date';
    case 'file':
      return 'file';
    default:
      return 'text';
  }
}

export type FormOutcome = 'submitted' | 'approved' | 'rejected' | 'revised' | 'timedOut' | 'cancelled';

const FORM_OUTCOME_API: Record<FormOutcome, string> = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', revised: 'Revised', timedOut: 'TimedOut', cancelled: 'Cancelled' };

export function formOutcomeToApi(outcome: FormOutcome): string {
  return FORM_OUTCOME_API[outcome];
}

/** Descriptor for a single form field. */
export interface AgFormField {
  name: string;
  label: string;
  type: FormFieldType;
  isRequired: boolean;
  defaultValue?: unknown;
  hint?: string;
  options?: string[];
}

export function parseAgFormField(json: Record<string, unknown>): AgFormField {
  const rawOptions = jsonLookup(json, 'options');
  const options = Array.isArray(rawOptions) ? rawOptions.map(String) : undefined;
  return {
    name: jsonStr(json, 'name'),
    label: jsonStr(json, 'label'),
    type: formFieldTypeFromApi(jsonStr(json, 'type')),
    isRequired: jsonLookup(json, 'required') === true,
    defaultValue: jsonLookup(json, 'defaultValue'),
    hint: jsonOpt(json, 'hint'),
    options,
  };
}

export function agFormFieldToJson(field: AgFormField): Record<string, unknown> {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.isRequired,
    ...(field.hint ? { hint: field.hint } : {}),
    ...(field.options && field.options.length > 0 ? { options: field.options } : {}),
    ...(field.defaultValue != null ? { defaultValue: field.defaultValue } : {}),
  };
}

export interface FormRequest {
  id: string;
  contextId: string;
  runId: string;
  nodeId: string;
  kind: FormRequestKind;
  /** Channel discriminator (e.g. "forms", "approvals", "chat"). */
  channel: string;
  title: string;
  description?: string;
  message?: string;
  query?: string;
  metadata?: Record<string, unknown>;
  fields: AgFormField[];
  timeout?: number;
  createdAt: Date;
  respondent?: string;
}

export function effectiveContextId(request: FormRequest): string {
  return request.contextId.trim() || request.runId;
}

/** Seconds remaining before `timeout` (minutes) elapses since `createdAt`, or `undefined` if untimed. */
export function remainingSeconds(request: FormRequest): number | undefined {
  if (request.timeout == null) return undefined;
  const deadline = request.createdAt.getTime() + request.timeout * 60_000;
  const remaining = Math.round((deadline - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export function parseFormRequest(json: Record<string, unknown>): FormRequest {
  const rawFields = jsonLookup(json, 'fields');
  let fieldsList: unknown[] = [];
  if (Array.isArray(rawFields)) {
    fieldsList = rawFields;
  } else if (typeof rawFields === 'string' && rawFields.trim().length > 0) {
    try {
      const decoded: unknown = JSON.parse(rawFields);
      if (Array.isArray(decoded)) fieldsList = decoded;
    } catch {
      // Malformed inline JSON — treat as no fields.
    }
  }
  const fields = fieldsList.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(parseAgFormField);

  return {
    id: jsonStr(json, 'id'),
    contextId: jsonStr(json, 'contextId'),
    runId: jsonStr(json, 'runId'),
    nodeId: jsonStr(json, 'nodeId'),
    kind: formRequestKindFromApi(jsonStr(json, 'kind')),
    channel: jsonStr(json, 'channelType'),
    title: jsonStr(json, 'title'),
    description: jsonOpt(json, 'description'),
    message: jsonOpt(json, 'message'),
    query: jsonOpt(json, 'query'),
    metadata: jsonMap(json, 'metadata'),
    fields,
    timeout: jsonInt(json, 'timeout'),
    createdAt: jsonDateTime(json, 'createdAt') ?? new Date(),
    respondent: jsonOpt(json, 'respondent'),
  };
}

export interface FormResponse {
  outcome: FormOutcome;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  channel?: string;
  respondedBy?: string;
  responseText?: string;
}

export function formResponseToJson(response: FormResponse): Record<string, unknown> {
  return {
    outcome: formOutcomeToApi(response.outcome),
    ...(response.data ? { data: response.data } : {}),
    ...(response.metadata ? { metadata: response.metadata } : {}),
    ...(response.channel ? { channel: response.channel } : {}),
    ...(response.respondedBy ? { respondedBy: response.respondedBy } : {}),
    ...(response.responseText ? { responseText: response.responseText } : {}),
  };
}

export interface FormSubmitResult {
  status: string;
  contextId: string;
  runId: string;
  requestId: string;
}

export function parseFormSubmitResult(json: Record<string, unknown>): FormSubmitResult {
  return { status: jsonStr(json, 'status'), contextId: jsonStr(json, 'contextId'), runId: jsonStr(json, 'runId'), requestId: jsonStr(json, 'requestId') };
}

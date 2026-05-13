import { headers as natsHeaders, MsgHdrs, StoredMsg } from 'nats';

export function createNatsHeaders(
  headers: Record<string, string> | undefined,
): MsgHdrs | undefined {
  if (!headers || Object.keys(headers).length === 0) {
    return undefined;
  }

  const result = natsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    result.set(key, value);
  }
  return result;
}

export function extractHeaders(hdrs: MsgHdrs | undefined): Record<string, string> | undefined {
  if (!hdrs) return undefined;
  const result: Record<string, string> = {};
  for (const key of hdrs.keys()) {
    result[key] = hdrs.get(key);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function decodePayload(data: Uint8Array): string {
  try {
    return new TextDecoder().decode(data);
  } catch {
    return '';
  }
}

export function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function parseOptionalTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function storedMessageTimeMs(sm: StoredMsg): number | undefined {
  if (!sm.time) return undefined;
  if (sm.time instanceof Date) return sm.time.getTime();
  const parsed = Date.parse(String(sm.time));
  return Number.isNaN(parsed) ? undefined : parsed;
}

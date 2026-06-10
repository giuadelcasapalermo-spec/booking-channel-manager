import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// ── XML parser configured for OTA / B.XML payloads ───────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  allowBooleanAttributes: true,
  trimValues: true,
  // OTA uses repeated elements (e.g. multiple <RoomStay>) — always return arrays
  isArray: (name) =>
    [
      'HotelReservation',
      'RoomStay',
      'RoomRate',
      'Rate',
      'BaseByGuestAmt',
      'GuestCount',
      'AvailStatusMessage',
      'LengthOfStay',
      'CancelPenalty',
      'reservation',
      'room',
      'price',
    ].includes(name),
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true,
});

export function parseXml<T = unknown>(xml: string): T {
  return parser.parse(xml) as T;
}

export function buildXml(obj: unknown): string {
  return builder.build(obj) as string;
}

// ── Convenience: extract OTA success/error from response XML ─────────────

export interface OTAResult {
  ok: boolean;
  requestId: string;
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}

export function parseOTAResponse(xml: string, rootKey: string): OTAResult {
  const doc = parseXml<Record<string, unknown>>(xml);
  const root = doc[rootKey] as Record<string, unknown> | undefined;
  if (!root) return { ok: false, requestId: '', errors: [{ code: 'PARSE', message: 'Unexpected root element' }], warnings: [] };

  const requestId = String((root['@_EchoToken'] as string | undefined) ?? '');
  const hasSuccess = 'Success' in root;
  const rawErrors = root['Errors'] as Record<string, unknown> | undefined;
  const rawWarnings = root['Warnings'] as Record<string, unknown> | undefined;

  const toList = (block: Record<string, unknown> | undefined, key: string) => {
    if (!block) return [];
    const items = block[key];
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    return arr.map((e: Record<string, unknown>) => ({
      code: String(e['@_Code'] ?? ''),
      message: String(e['@_ShortText'] ?? e['#text'] ?? ''),
    }));
  };

  return {
    ok: hasSuccess && !rawErrors,
    requestId,
    errors: toList(rawErrors, 'Error'),
    warnings: toList(rawWarnings, 'Warning'),
  };
}

// ── OTA envelope helpers ──────────────────────────────────────────────────

export const OTA_NS = 'http://www.opentravel.org/OTA/2003/05';
export const OTA_VERSION = '8.000';

export function otaEnvelope(messageType: string, echoToken: string, payload: unknown): string {
  const doc = {
    [`OTA_${messageType}RQ`]: {
      '@_xmlns': OTA_NS,
      '@_Version': OTA_VERSION,
      '@_EchoToken': echoToken,
      '@_TimeStamp': new Date().toISOString(),
      '@_Target': process.env.BOOKING_MOCK_MODE === 'true' ? 'Test' : 'Production',
      ...(payload as object),
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

export function uniqueEchoToken(): string {
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

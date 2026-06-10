/**
 * GET  /api/mock/error          → lista tutti gli scenari di errore
 * POST /api/mock/error          → simula una risposta di errore da Booking
 *
 * Body: { scenario: MockErrorScenario, format: "bxml" | "ota", messageType?: string }
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { MOCK_ERRORS, ERROR_SCENARIO_LIST, ERROR_DESCRIPTIONS, getError } from '@/lib/mock/errors';

const BodySchema = z.object({
  scenario: z.enum(ERROR_SCENARIO_LIST as [string, ...string[]]),
  format: z.enum(['bxml', 'ota']).default('bxml'),
  messageType: z.string().default('HotelAvailNotif'),
  echoToken: z.string().default('test-token-001'),
});

export async function GET(): Promise<Response> {
  return Response.json({
    scenarios: ERROR_SCENARIO_LIST.map(s => ({
      key: s,
      description: ERROR_DESCRIPTIONS[s],
      httpStatus: MOCK_ERRORS[s].httpStatus,
      code: MOCK_ERRORS[s].otaCode,
      message: MOCK_ERRORS[s].message,
    })),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { scenario, format, messageType, echoToken } = parsed.data;
  const err = getError(scenario);
  if (!err) return Response.json({ error: 'Scenario non trovato' }, { status: 404 });

  const xml = format === 'ota'
    ? err.otaXml(echoToken, messageType)
    : err.bxmlXml;

  return Response.json({
    scenario,
    format,
    httpStatus: err.httpStatus,
    code: err.otaCode,
    message: err.message,
    xml,
  });
}

/**
 * GET  /api/mock/ari            → lista scenari ARI disponibili
 * POST /api/mock/ari            → esegue uno scenario e mostra il risultato
 *
 * Body: { scenario: "STANDARD_RATES" | "OCCUPANCY_RATES" | "CLOSE_ROOM" | "MIN_STAY_WEEKEND" | "OPEN_ALL",
 *         format: "bxml" | "ota" }
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ARI_TEST_SCENARIOS } from '@/lib/mock/ari';
import { pushRates, pushAvailability } from '@/lib/booking/bxml/rates';
import { sendRateAmountNotif } from '@/lib/booking/ota/rate-amount-notif';
import { sendHotelAvailNotif } from '@/lib/booking/ota/hotel-avail-notif';

const RATE_SCENARIOS = ['STANDARD_RATES', 'OCCUPANCY_RATES'] as const;
const AVAIL_SCENARIOS = ['CLOSE_ROOM', 'MIN_STAY_WEEKEND', 'OPEN_ALL'] as const;

const BodySchema = z.object({
  scenario: z.enum([...RATE_SCENARIOS, ...AVAIL_SCENARIOS]),
  format: z.enum(['bxml', 'ota']).default('bxml'),
});

export async function GET(): Promise<Response> {
  return Response.json({
    scenarios: {
      rates: RATE_SCENARIOS,
      availability: AVAIL_SCENARIOS,
    },
    note: 'POST con { scenario, format } per eseguire un test',
    mockMode: process.env.BOOKING_MOCK_MODE === 'true',
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { scenario, format } = parsed.data;

  const isRate = (RATE_SCENARIOS as readonly string[]).includes(scenario);
  const scenarioFn = ARI_TEST_SCENARIOS[scenario];
  const updates = scenarioFn();

  const result = isRate
    ? (format === 'ota'
      ? await sendRateAmountNotif(updates as Parameters<typeof sendRateAmountNotif>[0])
      : await pushRates(updates as Parameters<typeof pushRates>[0]))
    : (format === 'ota'
      ? await sendHotelAvailNotif(updates as Parameters<typeof sendHotelAvailNotif>[0])
      : await pushAvailability(updates as Parameters<typeof pushAvailability>[0]));

  return Response.json({
    scenario,
    format,
    type: isRate ? 'rates' : 'availability',
    updatesCount: updates.length,
    mock: process.env.BOOKING_MOCK_MODE === 'true',
    result,
  }, { status: result.ok ? 200 : 502 });
}

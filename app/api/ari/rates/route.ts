/**
 * POST /api/ari/rates
 * Invia aggiornamenti tariffe a Booking.com.
 * In MOCK_MODE simula la risposta senza chiamate reali.
 *
 * Body: { format: "bxml" | "ota", updates: RateUpdate[] }
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pushRates } from '@/lib/booking/bxml/rates';
import { sendRateAmountNotif } from '@/lib/booking/ota/rate-amount-notif';

const RateUpdateSchema = z.object({
  roomId: z.string(),
  ratePlanId: z.string(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().positive(),
  currency: z.string().length(3).default('EUR'),
  priceByOccupancy: z.record(z.coerce.number(), z.number()).optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
});

const BodySchema = z.object({
  format: z.enum(['bxml', 'ota']).default('bxml'),
  updates: z.array(RateUpdateSchema).min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { format, updates } = parsed.data;

  const result = format === 'ota'
    ? await sendRateAmountNotif(updates)
    : await pushRates(updates);

  return Response.json({
    format,
    mock: process.env.BOOKING_MOCK_MODE === 'true',
    ...result,
  }, { status: result.ok ? 200 : 502 });
}

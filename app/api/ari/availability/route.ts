/**
 * POST /api/ari/availability
 * Invia aggiornamenti disponibilità e restrizioni a Booking.com.
 *
 * Body: { format: "bxml" | "ota", updates: AvailabilityUpdate[] }
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pushAvailability } from '@/lib/booking/bxml/rates';
import { sendHotelAvailNotif } from '@/lib/booking/ota/hotel-avail-notif';

const AvailUpdateSchema = z.object({
  roomId: z.string(),
  ratePlanId: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roomsToSell: z.number().min(0).max(255),
  closed: z.boolean().optional(),
  closedOnArrival: z.boolean().optional(),
  closedOnDeparture: z.boolean().optional(),
  minStay: z.number().int().positive().optional(),
  maxStay: z.number().int().positive().optional(),
  minStayArrival: z.number().int().positive().optional(),
  maxStayArrival: z.number().int().positive().optional(),
  minAdvanceBookingDays: z.number().int().min(0).max(360).optional(),
  maxAdvanceBookingDays: z.number().int().min(0).max(360).optional(),
});

const BodySchema = z.object({
  format: z.enum(['bxml', 'ota']).default('bxml'),
  updates: z.array(AvailUpdateSchema).min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { format, updates } = parsed.data;

  const result = format === 'ota'
    ? await sendHotelAvailNotif(updates)
    : await pushAvailability(updates);

  return Response.json({
    format,
    mock: process.env.BOOKING_MOCK_MODE === 'true',
    ...result,
  }, { status: result.ok ? 200 : 502 });
}

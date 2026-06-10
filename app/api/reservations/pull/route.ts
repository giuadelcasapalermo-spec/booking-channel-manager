/**
 * POST /api/reservations/pull
 * Esegue un pull prenotazioni e salva tutto nel file store.
 * Chiamato ogni 20s dall'auto-poll del dashboard.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pullReservations, acknowledgeBxmlReservations } from '@/lib/booking/bxml/reservations';
import { pullOTAReservations, acknowledgeOTAReservations } from '@/lib/booking/ota/hotel-res-notif';
import { upsertReservation, setPollState, appendPollLog } from '@/lib/db/store';

const BodySchema = z.object({
  format: z.enum(['bxml', 'ota']).default('bxml'),
  acknowledge: z.boolean().default(true),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { format, acknowledge } = parsed.data;
  const t0 = Date.now();
  const ts = new Date().toISOString();

  try {
    const reservations = format === 'ota'
      ? await pullOTAReservations()
      : await pullReservations();

    for (const r of reservations) upsertReservation(r);

    if (acknowledge && reservations.length > 0) {
      if (format === 'ota') {
        await acknowledgeOTAReservations(reservations.map(r => r.id));
      } else {
        await acknowledgeBxmlReservations(reservations.map(r => r.id));
      }
    }

    const durationMs = Date.now() - t0;
    const ids = reservations.map(r => r.id);

    setPollState({ lastPollAt: ts, pendingCount: reservations.length, lastError: null });
    appendPollLog({ ts, pulled: reservations.length, format, durationMs, ids });

    return Response.json({
      pulled: reservations.length,
      durationMs,
      format,
      mock: process.env.BOOKING_MOCK_MODE === 'true',
      reservations: reservations.map(r => ({
        id: r.id,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        guest: `${r.guest.firstName} ${r.guest.lastName}`,
        total: r.totalPrice,
        currency: r.currency,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const durationMs = Date.now() - t0;
    setPollState({ lastError: message });
    appendPollLog({ ts, pulled: 0, format, durationMs, error: message, ids: [] });
    return Response.json({ error: message }, { status: 502 });
  }
}

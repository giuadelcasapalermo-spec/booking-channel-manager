/**
 * POST /api/webhook/booking
 *
 * Riceve notifiche push da Booking.com in formato XML (B.XML o OTA).
 * Da configurare nel portale connect.booking.com come "Notification URL".
 *
 * Sicurezza: se BOOKING_WEBHOOK_SECRET è impostato, valida l'header
 * X-Booking-Signature (HMAC-SHA256 hex prefissato "sha256=").
 */
import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { parseBxmlReservations } from '@/lib/booking/bxml/reservations';
import { parseOTAReservations } from '@/lib/booking/ota/hotel-res-notif';
import { upsertReservation, setPollState, appendPollLog } from '@/lib/db/store';

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();

  const secret = process.env.BOOKING_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-booking-signature');
    if (!verifySignature(rawBody, sig, secret)) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const trimmed = rawBody.trim();
  if (!trimmed.startsWith('<')) {
    return Response.json({ error: 'XML body expected' }, { status: 400 });
  }

  const t0 = Date.now();
  const ts = new Date().toISOString();

  try {
    const isOTA = trimmed.includes('OTA_HotelResNotif');
    const format = isOTA ? 'ota-push' : 'bxml-push';
    const reservations = isOTA
      ? parseOTAReservations(rawBody)
      : parseBxmlReservations(rawBody);

    for (const r of reservations) upsertReservation(r);

    const durationMs = Date.now() - t0;
    appendPollLog({ ts, pulled: reservations.length, format, durationMs, ids: reservations.map(r => r.id) });
    setPollState({ lastPollAt: ts, pendingCount: reservations.length, lastError: null });

    // Risposta ACK attesa da Booking.com (B.XML o OTA)
    if (isOTA) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="8.000"><Success/></OTA_HotelResNotifRS>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } }
      );
    }

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><response><acknowledged>1</acknowledged></response>`,
      { status: 200, headers: { 'Content-Type': 'application/xml' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setPollState({ lastError: message });
    return Response.json({ error: message }, { status: 422 });
  }
}

/** GET /api/webhook/booking — info di configurazione per il portale Booking */
export async function GET(): Promise<Response> {
  return Response.json({
    endpoint: '/api/webhook/booking',
    method: 'POST',
    contentType: 'application/xml',
    security: process.env.BOOKING_WEBHOOK_SECRET ? 'HMAC-SHA256 (X-Booking-Signature)' : 'none (configura BOOKING_WEBHOOK_SECRET)',
    formats: ['B.XML', 'OTA_HotelResNotifRQ'],
    note: 'Configura questo URL su connect.booking.com → Connectivity Settings → Notification URL',
  });
}

/**
 * Mock Booking.com Server — simula le API reali per test locali.
 *
 * Per usarlo invece del vero Booking.com, imposta in .env.local:
 *   BOOKING_ARI_BASE=http://localhost:3001/api/mock/booking-server
 *   BOOKING_RES_BASE=http://localhost:3001/api/mock/booking-server
 *   BOOKING_MOCK_MODE=false        ← così le chiamate HTTP sono reali (verso questo server)
 *   BOOKING_USERNAME=hotel-test-001
 *   BOOKING_PASSWORD=test-password
 *   BOOKING_HOTEL_ID=hotel-test-001
 *
 * Endpoints simulati:
 *   POST /hotels/xml/availability        → ARI push (tariffe + disponibilità)
 *   GET  /hotels/xml/reservations        → pull prenotazioni B.XML
 *   POST /hotels/xml/reservations        → pull prenotazioni B.XML (stesso della GET)
 *   POST /hotels/xml/reservationAck      → acknowledge B.XML
 *   GET  /hotels/ota/OTA_HotelResNotif   → pull prenotazioni OTA
 *   POST /hotels/ota/OTA_HotelResNotif   → acknowledge OTA
 *   POST /hotels/ota/token               → token OAuth mock
 *   GET  /status                         → stato interno del server
 *   POST /reset                          → reimposta stato (ack, log)
 */
import { NextRequest } from 'next/server';
import { parseXml } from '@/lib/booking/xml';
import { MOCK_RESERVATIONS, mockBxmlXmlBatch } from '@/lib/mock/reservations';
import { mockOTAXmlBatch } from '@/lib/mock/ota-reservations';

// ── Stato in-memory del mock server ──────────────────────────────────────
// (si azzera a ogni riavvio del processo, ok per sviluppo)
const state = {
  acknowledged: new Set<string>(),
  ariLog: [] as AriLogEntry[],
  tokenCalls: 0,
};

interface AriLogEntry {
  ts: string;
  method: string;
  path: string;
  hotelId: string;
  roomCount: number;
  valid: boolean;
  error?: string;
  bodyPreview: string;
}

function pending() {
  return MOCK_RESERVATIONS.filter(r => !state.acknowledged.has(r.id));
}

function extractPath(req: NextRequest): string {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/mock\/booking-server(.+)/);
  return match?.[1] ?? '';
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

function bxmlAck(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><response><acknowledged>1</acknowledged></response>`;
}

function bxmlError(msg: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><response><error>${msg}</error></response>`;
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const path = extractPath(req);

  // OAuth token (anche con GET per compatibilità)
  if (path === '/hotels/ota/token') {
    state.tokenCalls++;
    return Response.json({
      access_token: `mock-token-${Date.now()}`,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }

  // Pull prenotazioni B.XML
  if (path === '/hotels/xml/reservations') {
    const list = pending();
    return xmlResponse(list.length > 0 ? mockBxmlXmlBatch(list) : bxmlAck());
  }

  // Pull prenotazioni OTA
  if (path === '/hotels/ota/OTA_HotelResNotif') {
    const list = pending();
    return xmlResponse(
      list.length > 0
        ? mockOTAXmlBatch(list)
        : `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="8.000"><HotelReservations/></OTA_HotelResNotifRQ>`,
    );
  }

  // Status interno — utile per la dashboard
  if (path === '/status') {
    return Response.json({
      acknowledged: Array.from(state.acknowledged),
      pending: pending().map(r => ({ id: r.id, status: r.status })),
      ariLog: state.ariLog.slice(0, 20),
      tokenCalls: state.tokenCalls,
      totalReservations: MOCK_RESERVATIONS.length,
    });
  }

  return Response.json({ error: 'Unknown path', path }, { status: 404 });
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const path = extractPath(req);
  const body = await req.text();

  // OAuth token
  if (path === '/hotels/ota/token') {
    state.tokenCalls++;
    return Response.json({
      access_token: `mock-token-${Date.now()}`,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }

  // Pull prenotazioni B.XML via POST (formato identico alla GET)
  if (path === '/hotels/xml/reservations') {
    const list = pending();
    return xmlResponse(list.length > 0 ? mockBxmlXmlBatch(list) : bxmlAck());
  }

  // ARI push — tariffe e disponibilità
  if (path === '/hotels/xml/availability') {
    const ts = new Date().toISOString();
    let valid = true;
    let errorMsg: string | undefined;
    let hotelId = '';
    let roomCount = 0;

    try {
      const doc = parseXml<{ request?: { hotel?: { '@_hotel_id'?: string; room?: unknown[] | unknown } } }>(body);
      const hotel = doc.request?.hotel;
      if (!hotel) throw new Error('Elemento <hotel> mancante');
      hotelId = String(hotel['@_hotel_id'] ?? '');
      const rooms = hotel.room;
      roomCount = Array.isArray(rooms) ? rooms.length : rooms ? 1 : 0;
    } catch (e) {
      valid = false;
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    state.ariLog.unshift({
      ts, method: 'POST', path, hotelId, roomCount, valid, error: errorMsg,
      bodyPreview: body.slice(0, 300),
    });
    if (state.ariLog.length > 100) state.ariLog.length = 100;

    if (!valid) {
      return xmlResponse(bxmlError(errorMsg ?? 'XML non valido'), 400);
    }
    return xmlResponse(bxmlAck());
  }

  // Acknowledge B.XML
  if (path === '/hotels/xml/reservationAck') {
    try {
      const doc = parseXml<{ request?: { id?: string | string[] } }>(body);
      const ids = doc.request?.id;
      const arr = Array.isArray(ids) ? ids : ids ? [ids] : [];
      arr.forEach(id => state.acknowledged.add(String(id)));
      return xmlResponse(bxmlAck());
    } catch (e) {
      return xmlResponse(bxmlError(String(e)), 400);
    }
  }

  // Acknowledge OTA
  if (path === '/hotels/ota/OTA_HotelResNotif') {
    try {
      interface AckDoc {
        OTA_HotelResNotifRS?: {
          HotelReservations?: { HotelReservation?: { UniqueID?: { '@_ID': string } }[] };
        };
      }
      const doc = parseXml<AckDoc>(body);
      const items = doc.OTA_HotelResNotifRS?.HotelReservations?.HotelReservation ?? [];
      items.forEach(r => {
        const id = r.UniqueID?.['@_ID'];
        if (id) state.acknowledged.add(String(id));
      });
    } catch { /* ignora errori di parsing — rispondi sempre OK */ }
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="8.000"><Success/></OTA_HotelResNotifRS>`,
    );
  }

  // Reset stato (per ricominciare i test senza riavviare il server)
  if (path === '/reset') {
    state.acknowledged.clear();
    state.ariLog.length = 0;
    state.tokenCalls = 0;
    return Response.json({ reset: true, message: 'Stato mock server azzerato' });
  }

  return Response.json({ error: 'Unknown path', path }, { status: 404 });
}

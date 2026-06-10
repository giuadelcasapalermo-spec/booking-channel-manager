/**
 * GET  /api/mock/reservation          → lista tutti gli scenari disponibili
 * GET  /api/mock/reservation?id=BK-001-2026 → XML B.XML di quella prenotazione
 * POST /api/mock/reservation          → parsa un XML B.XML e ritorna il JSON strutturato
 *
 * Utile per testare il round-trip XML ↔ TypeScript senza Booking reale.
 */
import { NextRequest } from 'next/server';
import { MOCK_RESERVATIONS, mockBxmlXml } from '@/lib/mock/reservations';
import { parseBxmlReservations } from '@/lib/booking/bxml/reservations';

export async function GET(req: NextRequest): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id');

  if (id) {
    const res = MOCK_RESERVATIONS.find(r => r.id === id);
    if (!res) return Response.json({ error: `Reservation ${id} not found` }, { status: 404 });

    const xml = mockBxmlXml(res);
    // Return XML when Accept header requests it
    if (req.headers.get('accept')?.includes('application/xml')) {
      return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
    }
    return Response.json({ id, xml, parsed: res });
  }

  return Response.json({
    available: MOCK_RESERVATIONS.map(r => ({
      id: r.id,
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      guest: `${r.guest.firstName} ${r.guest.lastName}`,
      total: r.totalPrice,
    })),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? '';

  let xml: string;
  if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
    xml = await req.text();
  } else {
    let body: { xml?: string };
    try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
    if (!body.xml) return Response.json({ error: 'body.xml required' }, { status: 422 });
    xml = body.xml;
  }

  try {
    const parsed = parseBxmlReservations(xml);
    return Response.json({ parsed, count: parsed.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}

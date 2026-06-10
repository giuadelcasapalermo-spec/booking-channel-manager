/**
 * POST /api/mock/xml
 * Costruisce e restituisce l'XML che verrebbe inviato a Booking.com
 * per un dato scenario, senza fare chiamate reali.
 *
 * Body: { type, format, scenario?, data? }
 *   type:     "ari_rates" | "ari_availability" | "res_pull" | "res_ack" | "res_incoming"
 *   format:   "bxml" | "ota"
 *   scenario: nome scenario ARI (opzionale, sovrascrive data)
 *   data:     array di RateUpdate / AvailabilityUpdate (opzionale)
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  previewBxmlRates, previewBxmlAvailability,
  previewOtaRates, previewOtaAvailability,
  previewBxmlReservationPull, previewOtaReservationAck,
} from '@/lib/booking/xml-preview';
import { ARI_TEST_SCENARIOS } from '@/lib/mock/ari';
import { mockBxmlXml, MOCK_RESERVATIONS } from '@/lib/mock/reservations';

const RATE_SCENARIOS = ['STANDARD_RATES', 'OCCUPANCY_RATES'];
const AVAIL_SCENARIOS = ['CLOSE_ROOM', 'MIN_STAY_WEEKEND', 'OPEN_ALL'];

const BodySchema = z.object({
  type: z.enum(['ari_rates', 'ari_availability', 'res_pull', 'res_ack', 'res_incoming']),
  format: z.enum(['bxml', 'ota']).default('bxml'),
  scenario: z.string().optional(),
  reservationId: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { type, format, scenario, reservationId } = parsed.data;
  let xml = '';
  let description = '';
  let endpoint = '';

  switch (type) {
    case 'ari_rates': {
      const sc = scenario ?? 'STANDARD_RATES';
      if (!RATE_SCENARIOS.includes(sc)) return Response.json({ error: 'Scenario non valido per rates' }, { status: 422 });
      const updates = ARI_TEST_SCENARIOS[sc as keyof typeof ARI_TEST_SCENARIOS]() as Parameters<typeof previewBxmlRates>[0];
      xml = format === 'ota' ? previewOtaRates(updates) : previewBxmlRates(updates);
      description = `Aggiornamento tariffe — scenario ${sc}`;
      endpoint = format === 'ota'
        ? 'POST https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif'
        : 'POST https://supply-xml.booking.com/hotels/xml/availability';
      break;
    }
    case 'ari_availability': {
      const sc = scenario ?? 'OPEN_ALL';
      if (!AVAIL_SCENARIOS.includes(sc)) return Response.json({ error: 'Scenario non valido per availability' }, { status: 422 });
      const updates = ARI_TEST_SCENARIOS[sc as keyof typeof ARI_TEST_SCENARIOS]() as Parameters<typeof previewBxmlAvailability>[0];
      xml = format === 'ota' ? previewOtaAvailability(updates) : previewBxmlAvailability(updates);
      description = `Aggiornamento disponibilità — scenario ${sc}`;
      endpoint = format === 'ota'
        ? 'POST https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif'
        : 'POST https://supply-xml.booking.com/hotels/xml/availability';
      break;
    }
    case 'res_pull': {
      xml = previewBxmlReservationPull();
      description = 'Richiesta pull prenotazioni (inviata a Booking)';
      endpoint = format === 'ota'
        ? 'GET https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif'
        : 'POST https://secure-supply-xml.booking.com/hotels/xml/reservations';
      break;
    }
    case 'res_ack': {
      const ids = reservationId ? [reservationId] : ['BK-001-2026', 'BK-002-2026'];
      xml = previewOtaReservationAck(ids);
      description = 'Acknowledge prenotazioni (inviato a Booking per evitare duplicati)';
      endpoint = 'POST https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif';
      break;
    }
    case 'res_incoming': {
      // XML che Booking invia a noi (la risposta al nostro pull)
      const resId = reservationId ?? 'BK-001-2026';
      const res = MOCK_RESERVATIONS.find(r => r.id === resId) ?? MOCK_RESERVATIONS[0];
      xml = mockBxmlXml(res);
      description = `XML prenotazione ricevuta da Booking (B.XML) — ${resId}`;
      endpoint = '← risposta da https://secure-supply-xml.booking.com/hotels/xml/reservations';
      break;
    }
  }

  return Response.json({ type, format, description, endpoint, xml, lines: xml.split('\n').length });
}

export async function GET(): Promise<Response> {
  return Response.json({
    usage: 'POST con { type, format, scenario?, reservationId? }',
    types: {
      ari_rates: { description: 'XML tariffe → Booking', scenarios: RATE_SCENARIOS, formats: ['bxml', 'ota'] },
      ari_availability: { description: 'XML disponibilità → Booking', scenarios: AVAIL_SCENARIOS, formats: ['bxml', 'ota'] },
      res_pull: { description: 'XML richiesta pull prenotazioni → Booking', formats: ['bxml', 'ota'] },
      res_ack: { description: 'XML acknowledge prenotazioni → Booking (solo OTA)', formats: ['ota'] },
      res_incoming: { description: 'XML prenotazione ricevuta ← Booking', scenarios: MOCK_RESERVATIONS.map(r => r.id), formats: ['bxml'] },
    },
  });
}

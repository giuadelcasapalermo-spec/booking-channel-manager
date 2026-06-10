/**
 * Mock ARI responses — simula la risposta di Booking.com agli aggiornamenti
 * di tariffe e disponibilità (B.XML e OTA).
 */
import type { RateUpdate, AvailabilityUpdate } from '@/lib/booking/types';

// ── Mock success response B.XML ──────────────────────────────────────────

export const MOCK_ARI_SUCCESS_BXML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <acknowledged>1</acknowledged>
</response>`;

// ── Mock success response OTA ─────────────────────────────────────────────

export function mockOTASuccessResponse(messageType: string, echoToken: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<${messageType}RS
  xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="8.000"
  EchoToken="${echoToken}"
  TimeStamp="${new Date().toISOString()}"
>
  <Success/>
</${messageType}RS>`;
}

// ── Mock error response OTA ───────────────────────────────────────────────

export function mockOTAErrorResponse(messageType: string, echoToken: string, code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<${messageType}RS
  xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="8.000"
  EchoToken="${echoToken}"
  TimeStamp="${new Date().toISOString()}"
>
  <Errors>
    <Error Type="12" Code="${code}" ShortText="${message}"/>
  </Errors>
</${messageType}RS>`;
}

// ── Scenari di test ARI ───────────────────────────────────────────────────

export const ARI_TEST_SCENARIOS = {
  // Tariffe standard — weekend più caro
  STANDARD_RATES: (): RateUpdate[] => {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    return [
      {
        roomId: 'room-deluxe-01',
        ratePlanId: 'rate-standard',
        dateFrom: from,
        dateTo: to,
        price: 120,
        currency: 'EUR',
        daysOfWeek: [0, 1, 2, 3, 4], // lun-ven
      },
      {
        roomId: 'room-deluxe-01',
        ratePlanId: 'rate-standard',
        dateFrom: from,
        dateTo: to,
        price: 160,
        currency: 'EUR',
        daysOfWeek: [5, 6], // sab-dom
      },
    ];
  },

  // Tariffe per occupazione (1-4 persone)
  OCCUPANCY_RATES: (): RateUpdate[] => {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    return [
      {
        roomId: 'room-family-01',
        ratePlanId: 'rate-standard',
        dateFrom: from,
        dateTo: to,
        price: 150, // fallback
        currency: 'EUR',
        priceByOccupancy: { 1: 100, 2: 150, 3: 190, 4: 220 },
      },
    ];
  },

  // Chiusura per lavori (camera fuori servizio)
  CLOSE_ROOM: (): AvailabilityUpdate[] => {
    const today = new Date();
    const from = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    return [
      {
        roomId: 'room-standard-01',
        dateFrom: from,
        dateTo: to,
        roomsToSell: 0,
        closed: true,
      },
    ];
  },

  // Restrizione soggiorno minimo nel weekend (3 notti)
  MIN_STAY_WEEKEND: (): AvailabilityUpdate[] => {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    return [
      {
        roomId: 'room-deluxe-01',
        dateFrom: from,
        dateTo: to,
        roomsToSell: 1,
        minStayArrival: 3, // min 3 notti se si arriva in questo periodo
        closedOnArrival: false,
        closedOnDeparture: false,
      },
    ];
  },

  // Apertura completa con disponibilità illimitata
  OPEN_ALL: (): AvailabilityUpdate[] => {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);
    return [
      {
        roomId: 'room-deluxe-01',
        dateFrom: from,
        dateTo: to,
        roomsToSell: 255, // unlimited
        closed: false,
      },
      {
        roomId: 'room-deluxe-02',
        dateFrom: from,
        dateTo: to,
        roomsToSell: 255,
        closed: false,
      },
      {
        roomId: 'room-family-01',
        dateFrom: from,
        dateTo: to,
        roomsToSell: 255,
        closed: false,
      },
    ];
  },
};

/**
 * Mock reservations that simulate what Booking.com would push.
 * Covers: new, modified, cancelled, multi-night, children, overbooking candidate.
 */
import type { BookingReservation } from '@/lib/booking/types';

const today = new Date();
const d = (offsetDays: number) => {
  const dt = new Date(today);
  dt.setDate(today.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};

export const MOCK_RESERVATIONS: BookingReservation[] = [
  // ── 1. Nuova prenotazione standard (2 adulti, 3 notti) ─────────────────
  {
    id: 'BK-001-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-deluxe-01',
    ratePlanId: 'rate-standard',
    status: 'new',
    bookedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
    checkIn: d(5),
    checkOut: d(8),
    guest: {
      firstName: 'Marco',
      lastName: 'Bianchi',
      email: 'marco.bianchi@email.it',
      phone: '+39 333 1234567',
      address: 'Via Roma 12',
      city: 'Milano',
      countryCode: 'IT',
      country: 'Italy',
      adults: 2,
      children: 0,
    },
    nightlyRates: [
      { date: d(5), price: 120, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(6), price: 120, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(7), price: 140, currency: 'EUR', ratePlanId: 'rate-standard' },
    ],
    totalPrice: 380,
    currency: 'EUR',
    commission: 57,      // ~15%
    hotelReceivable: 323,
    cityTax: 4.50,
    cityTaxIncluded: false,
    cancelPenalties: [
      { amount: 120, currency: 'EUR', from: d(3) },
    ],
  },

  // ── 2. Prenotazione con bambini ────────────────────────────────────────
  {
    id: 'BK-002-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-family-01',
    ratePlanId: 'rate-standard',
    status: 'new',
    bookedAt: new Date(today.getTime() - 86400000).toISOString(),
    checkIn: d(10),
    checkOut: d(14),
    guest: {
      firstName: 'Laura',
      lastName: 'Rossi',
      email: 'laura.rossi@gmail.com',
      phone: '+39 347 9876543',
      countryCode: 'IT',
      country: 'Italy',
      adults: 2,
      children: 2,
      childAges: [8, 5],
    },
    nightlyRates: [
      { date: d(10), price: 180, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(11), price: 180, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(12), price: 200, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(13), price: 200, currency: 'EUR', ratePlanId: 'rate-standard' },
    ],
    totalPrice: 760,
    currency: 'EUR',
    commission: 114,
    hotelReceivable: 646,
    cityTax: 9.00,
    cityTaxIncluded: false,
  },

  // ── 3. Prenotazione modificata (date spostate) ──────────────────────────
  {
    id: 'BK-003-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-deluxe-01',
    ratePlanId: 'rate-standard',
    status: 'modified',
    bookedAt: new Date(today.getTime() - 5 * 86400000).toISOString(),
    modifiedAt: new Date(today.getTime() - 86400000).toISOString(),
    checkIn: d(15),
    checkOut: d(17),
    guest: {
      firstName: 'Thomas',
      lastName: 'Müller',
      email: 't.mueller@web.de',
      phone: '+49 170 5555555',
      countryCode: 'DE',
      country: 'Germany',
      adults: 1,
      children: 0,
    },
    nightlyRates: [
      { date: d(15), price: 95, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(16), price: 95, currency: 'EUR', ratePlanId: 'rate-standard' },
    ],
    totalPrice: 190,
    currency: 'EUR',
    commission: 28.50,
    hotelReceivable: 161.50,
    cityTax: 3.00,
    cityTaxIncluded: false,
  },

  // ── 4. Prenotazione cancellata ─────────────────────────────────────────
  {
    id: 'BK-004-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-deluxe-02',
    ratePlanId: 'rate-standard',
    status: 'cancelled',
    bookedAt: new Date(today.getTime() - 10 * 86400000).toISOString(),
    modifiedAt: today.toISOString(),
    checkIn: d(20),
    checkOut: d(22),
    guest: {
      firstName: 'Sophie',
      lastName: 'Martin',
      email: 'sophie.martin@laposte.fr',
      phone: '+33 6 12345678',
      countryCode: 'FR',
      country: 'France',
      adults: 2,
      children: 0,
    },
    nightlyRates: [
      { date: d(20), price: 110, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(21), price: 110, currency: 'EUR', ratePlanId: 'rate-standard' },
    ],
    totalPrice: 220,
    currency: 'EUR',
    commission: 33,
    hotelReceivable: 187,
    cityTax: 3.00,
    cityTaxIncluded: false,
    cancelPenalties: [
      { amount: 110, currency: 'EUR', from: d(-2) },  // penale già maturata
    ],
  },

  // ── 5. Last-minute (stessa settimana, piano tariffario flex, city tax inclusa) ──
  {
    id: 'BK-005-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-standard-01',
    ratePlanId: 'rate-flex',
    status: 'new',
    bookedAt: today.toISOString(),
    checkIn: d(2),
    checkOut: d(4),
    guest: {
      firstName: 'James',
      lastName: 'Smith',
      email: 'james.smith@outlook.com',
      phone: '+44 7700 900123',
      countryCode: 'GB',
      country: 'United Kingdom',
      adults: 1,
      children: 0,
    },
    nightlyRates: [
      { date: d(2), price: 85, currency: 'EUR', ratePlanId: 'rate-flex' },
      { date: d(3), price: 85, currency: 'EUR', ratePlanId: 'rate-flex' },
    ],
    totalPrice: 170,
    currency: 'EUR',
    commission: 25.50,
    hotelReceivable: 144.50,
    cityTax: 3.00,
    cityTaxIncluded: true,
  },

  // ── 6. Tariffa NON rimborsabile (penale 100% dal momento della prenotazione) ──
  {
    id: 'BK-006-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-deluxe-01',
    ratePlanId: 'rate-nonrefundable',
    status: 'new',
    bookedAt: new Date(today.getTime() - 3 * 86400000).toISOString(),
    checkIn: d(30),
    checkOut: d(33),
    guest: {
      firstName: 'Anna',
      lastName: 'Schmidt',
      email: 'anna.schmidt@gmail.com',
      phone: '+49 176 8877665',
      countryCode: 'DE',
      country: 'Germany',
      adults: 2,
      children: 0,
    },
    nightlyRates: [
      { date: d(30), price: 99, currency: 'EUR', ratePlanId: 'rate-nonrefundable' },
      { date: d(31), price: 99, currency: 'EUR', ratePlanId: 'rate-nonrefundable' },
      { date: d(32), price: 99, currency: 'EUR', ratePlanId: 'rate-nonrefundable' },
    ],
    totalPrice: 297,
    currency: 'EUR',
    commission: 44.55,
    hotelReceivable: 252.45,
    cityTax: 4.50,
    cityTaxIncluded: false,
    // Penale = 100% del totale (non rimborsabile dal primo giorno)
    cancelPenalties: [
      { amount: 297, currency: 'EUR', from: new Date(today.getTime() - 3 * 86400000).toISOString() },
    ],
  },

  // ── 7. Prenotazione internazionale — dati ospite minimali (solo nome + paese) ──
  // Simula un ospite che prenota senza fornire recapiti completi.
  {
    id: 'BK-007-2026',
    hotelId: 'hotel-test-001',
    roomId: 'room-standard-01',
    ratePlanId: 'rate-standard',
    status: 'new',
    bookedAt: today.toISOString(),
    checkIn: d(45),
    checkOut: d(47),
    guest: {
      firstName: 'Yuki',
      lastName: 'Tanaka',
      email: '',           // Booking.com non sempre espone la mail
      phone: '',           // e il telefono
      countryCode: 'JP',
      country: 'Japan',
      adults: 1,
      children: 0,
    },
    nightlyRates: [
      { date: d(45), price: 110, currency: 'EUR', ratePlanId: 'rate-standard' },
      { date: d(46), price: 110, currency: 'EUR', ratePlanId: 'rate-standard' },
    ],
    totalPrice: 220,
    currency: 'EUR',
    commission: 33,
    hotelReceivable: 187,
    cityTax: 3.00,
    cityTaxIncluded: false,
  },
];

// ── Helpers XML B.XML ─────────────────────────────────────────────────────

/** Restituisce solo l'elemento <reservation>…</reservation> (senza wrapper né dichiarazione XML). */
export function bxmlReservationElement(r: BookingReservation): string {
  const priceNodes = r.nightlyRates
    .map(n => `      <price date="${n.date}" rate_id="${n.ratePlanId}" price="${n.price}" currency="${n.currency}"/>`)
    .join('\n');

  const cancelNodes = (r.cancelPenalties ?? [])
    .map(p => `    <cancel_penalty amount="${p.amount}" currency="${p.currency}" from="${p.from}"/>`)
    .join('\n');

  return `  <reservation
    id="${r.id}"
    hotel_id="${r.hotelId}"
    status="${r.status}"
    totalprice="${r.totalPrice}"
    booked_at="${r.bookedAt}"
    ${r.modifiedAt ? `modified_at="${r.modifiedAt}"` : ''}
  >
    <customer
      name="${r.guest.firstName} ${r.guest.lastName}"
      email="${r.guest.email}"
      telephone="${r.guest.phone}"
      country_code="${r.guest.countryCode ?? ''}"
      country="${r.guest.country ?? ''}"
    />
    <room
      room_id="${r.roomId}"
      checkin="${r.checkIn}"
      checkout="${r.checkOut}"
      adults="${r.guest.adults}"
      children="${r.guest.children}"
      ${r.guest.childAges ? `child_ages="${r.guest.childAges.join(',')}"` : ''}
    >
${priceNodes}
    </room>
    <price_details>
      <commission>${r.commission}</commission>
      <hotel_receivable amount="${r.hotelReceivable}" currency="${r.currency}"/>
      <guest_paid>
        <city_tax included="${r.cityTaxIncluded ? 1 : 0}">${r.cityTax}</city_tax>
      </guest_paid>
    </price_details>
    ${cancelNodes ? `<cancel_penalties>\n${cancelNodes}\n    </cancel_penalties>` : ''}
  </reservation>`;
}

/** Documento B.XML completo con una singola prenotazione (per test round-trip). */
export function mockBxmlXml(reservation: BookingReservation): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<reservations>
${bxmlReservationElement(reservation)}
</reservations>`;
}

/** Documento B.XML con più prenotazioni in un singolo messaggio. */
export function mockBxmlXmlBatch(reservations: BookingReservation[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<reservations>
${reservations.map(r => bxmlReservationElement(r)).join('\n')}
</reservations>`;
}

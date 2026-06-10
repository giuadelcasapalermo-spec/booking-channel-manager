/**
 * OTA_HotelResNotif — pull + acknowledge reservations
 * GET  https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif  → fetch pending
 * POST https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif  → acknowledge
 *
 * Same pattern for OTA_HotelResModifyNotif (modifications + cancellations).
 * Policy: leave ≥20s between GET calls.
 */
import { parseXml, buildXml, uniqueEchoToken, OTA_NS, OTA_VERSION } from '../xml';
import { authHeaders } from '../auth';
import type { BookingReservation, BookingGuest, NightlyRate, CancelPenalty } from '../types';
import { MOCK_RESERVATIONS } from '@/lib/mock/reservations';

const BASE = () => process.env.BOOKING_RES_BASE ?? 'https://secure-supply-xml.booking.com';

// ── Pull ──────────────────────────────────────────────────────────────────

export async function pullOTAReservations(): Promise<BookingReservation[]> {
  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return MOCK_RESERVATIONS;
  }

  const res = await fetch(`${BASE()}/hotels/ota/OTA_HotelResNotif`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`OTA_HotelResNotif GET failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return parseOTAReservations(text);
}

// ── Acknowledge ───────────────────────────────────────────────────────────

export async function acknowledgeOTAReservations(reservationIds: string[]): Promise<void> {
  if (process.env.BOOKING_MOCK_MODE === 'true') return;

  const echoToken = uniqueEchoToken();
  const acks = reservationIds.map(id => ({
    UniqueID: { '@_Type': '14', '@_ID': id },
    ResStatus: 'Acknowledged',
  }));

  const doc = {
    OTA_HotelResNotifRS: {
      '@_xmlns': OTA_NS,
      '@_Version': OTA_VERSION,
      '@_EchoToken': echoToken,
      '@_TimeStamp': new Date().toISOString(),
      Success: '',
      HotelReservations: { HotelReservation: acks },
    },
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;

  await fetch(`${BASE()}/hotels/ota/OTA_HotelResNotif`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml' },
    body: xml,
  });
}

// ── Parser ────────────────────────────────────────────────────────────────

// Typed just enough to extract what we need from the OTA envelope
interface OTAResDoc {
  OTA_HotelResNotifRQ?: {
    HotelReservations?: { HotelReservation?: OTAHotelReservation[] };
  };
}

interface OTAHotelReservation {
  '@_ResStatus'?: string;
  UniqueID?: { '@_ID': string };
  ResGuests?: {
    ResGuest?: {
      Profiles?: { Profile?: { Customer?: OTACustomer } };
      GuestCounts?: { GuestCount?: { '@_AgeQualifyingCode': number; '@_Count': number; '@_Age'?: number }[] };
    };
  };
  RoomStays?: {
    RoomStay?: OTARoomStay[];
  };
}

interface OTACustomer {
  PersonName?: { GivenName?: string; Surname?: string };
  Email?: string;
  Telephone?: { '@_PhoneNumber': string };
  Address?: { AddressLine?: string; CityName?: string; CountryName?: { '@_Code': string } };
}

interface OTARoomStay {
  '@_IndexNumber'?: number;
  RoomTypes?: { RoomType?: { '@_RoomTypeCode': string } };
  TimeSpan?: { '@_Start': string; '@_End': string };
  RatePlans?: { RatePlan?: { '@_RatePlanCode': string; Commission?: { '@_CommissionPayableAmount': number; '@_CurrencyCode': string } } };
  RoomRates?: { RoomRate?: { '@_EffectiveDate': string; '@_RatePlanCode': string; Rates?: { Rate?: { Base?: { '@_Amount': number; '@_CurrencyCode': string } } } }[] };
  Taxes?: { Tax?: { '@_Amount': number; '@_CurrencyCode': string } };
}

// Booking.com invia "Committed", "Modify", "Cancel" — normalizza ai nostri valori interni
const OTA_STATUS: Record<string, BookingReservation['status']> = {
  committed: 'new',
  new: 'new',
  modify: 'modified',
  modification: 'modified',
  modified: 'modified',
  cancel: 'cancelled',
  cancellation: 'cancelled',
  cancelled: 'cancelled',
};

export function parseOTAReservations(xml: string): BookingReservation[] {
  const doc = parseXml<OTAResDoc>(xml);
  const reservations = doc.OTA_HotelResNotifRQ?.HotelReservations?.HotelReservation ?? [];

  return reservations.map((r): BookingReservation => {
    const id = String(r.UniqueID?.['@_ID'] ?? '');
    const rawStatus = (r['@_ResStatus'] ?? 'new').toLowerCase();
    const status: BookingReservation['status'] = OTA_STATUS[rawStatus] ?? 'new';

    const resGuest = r.ResGuests?.ResGuest;
    const customer = resGuest?.Profiles?.Profile?.Customer;
    const guestCounts = resGuest?.GuestCounts?.GuestCount ?? [];
    const adults = guestCounts.filter(g => g['@_AgeQualifyingCode'] === 10).reduce((s, g) => s + g['@_Count'], 0) || 1;
    const children = guestCounts.filter(g => g['@_AgeQualifyingCode'] === 8).reduce((s, g) => s + g['@_Count'], 0);
    const childAges = guestCounts.filter(g => g['@_AgeQualifyingCode'] === 8 && g['@_Age'] !== undefined).map(g => g['@_Age']!);

    const guest: BookingGuest = {
      firstName: customer?.PersonName?.GivenName ?? '',
      lastName: customer?.PersonName?.Surname ?? '',
      email: customer?.Email ?? '',
      phone: customer?.Telephone?.['@_PhoneNumber'] ?? '',
      address: customer?.Address?.AddressLine,
      city: customer?.Address?.CityName,
      countryCode: customer?.Address?.CountryName?.['@_Code'],
      adults,
      children,
      childAges: childAges.length > 0 ? childAges : undefined,
    };

    const roomStay = r.RoomStays?.RoomStay?.[0];
    const roomId = roomStay?.RoomTypes?.RoomType?.['@_RoomTypeCode'] ?? '';
    const ratePlanId = roomStay?.RatePlans?.RatePlan?.['@_RatePlanCode'] ?? '';
    const checkIn = roomStay?.TimeSpan?.['@_Start'] ?? '';
    const checkOut = roomStay?.TimeSpan?.['@_End'] ?? '';
    const commission = roomStay?.RatePlans?.RatePlan?.Commission?.['@_CommissionPayableAmount'] ?? 0;
    const currency = roomStay?.RatePlans?.RatePlan?.Commission?.['@_CurrencyCode'] ?? 'EUR';

    const nightlyRates: NightlyRate[] = (roomStay?.RoomRates?.RoomRate ?? []).map(rr => ({
      date: rr['@_EffectiveDate'],
      price: rr.Rates?.Rate?.Base?.['@_Amount'] ?? 0,
      currency: rr.Rates?.Rate?.Base?.['@_CurrencyCode'] ?? currency,
      ratePlanId: rr['@_RatePlanCode'],
    }));

    const totalPrice = nightlyRates.reduce((s, n) => s + n.price, 0);
    const taxAmount = roomStay?.Taxes?.Tax?.['@_Amount'] ?? 0;

    return {
      id,
      hotelId: process.env.BOOKING_HOTEL_ID ?? '',
      roomId,
      ratePlanId,
      status,
      bookedAt: new Date().toISOString(),
      checkIn,
      checkOut,
      guest,
      nightlyRates,
      totalPrice,
      currency,
      commission,
      hotelReceivable: totalPrice - commission,
      cityTax: taxAmount,
      cityTaxIncluded: false,
      rawXml: xml,
    };
  });
}

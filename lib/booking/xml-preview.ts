/**
 * Funzioni che costruiscono l'XML senza inviarlo — usate dall'XML Viewer.
 * Riesporta le funzioni private dai moduli B.XML e OTA.
 */
import { buildXml, otaEnvelope, uniqueEchoToken } from './xml';
import type { RateUpdate, AvailabilityUpdate } from './types';

// ── B.XML Rate ────────────────────────────────────────────────────────────

function expandDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function previewBxmlRates(updates: RateUpdate[]): string {
  const rooms = updates.map(u => {
    const dates = expandDateRange(u.dateFrom, u.dateTo).map(date => {
      const rateAttr: Record<string, unknown> = {
        '@_rate_id': u.ratePlanId,
        '@_price': u.price,
        '@_currency': u.currency,
      };
      if (u.priceByOccupancy) {
        for (const [g, p] of Object.entries(u.priceByOccupancy)) rateAttr[`@_price${g}`] = p;
      }
      return { '@_date': date, rate: rateAttr };
    });
    return { '@_room_id': u.roomId, date: dates };
  });
  const doc = {
    request: {
      '@_version': '1.1',
      username: '{{USERNAME}}',
      password: '{{PASSWORD}}',
      hotel: { '@_hotel_id': '{{HOTEL_ID}}', room: rooms },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

// ── B.XML Availability ────────────────────────────────────────────────────

export function previewBxmlAvailability(updates: AvailabilityUpdate[]): string {
  const rooms = updates.map(u => {
    const dates = expandDateRange(u.dateFrom, u.dateTo).map(date => {
      const rateAttr: Record<string, unknown> = {
        '@_rate_id': u.ratePlanId ?? '',
        '@_roomstosell': u.roomsToSell,
        '@_closed': u.closed ? 1 : 0,
      };
      if (u.closedOnArrival !== undefined) rateAttr['@_closedonarrival'] = u.closedOnArrival ? 1 : 0;
      if (u.closedOnDeparture !== undefined) rateAttr['@_closedondeparture'] = u.closedOnDeparture ? 1 : 0;
      if (u.minStay !== undefined) rateAttr['@_minimumstay'] = u.minStay;
      if (u.maxStay !== undefined) rateAttr['@_maximumstay'] = u.maxStay;
      if (u.minStayArrival !== undefined) rateAttr['@_minimumstay_arrival'] = u.minStayArrival;
      if (u.minAdvanceBookingDays !== undefined) rateAttr['@_min_advance_res'] = `${u.minAdvanceBookingDays}D`;
      if (u.maxAdvanceBookingDays !== undefined) rateAttr['@_max_advance_res'] = `${u.maxAdvanceBookingDays}D`;
      return { '@_date': date, rate: rateAttr };
    });
    return { '@_room_id': u.roomId, date: dates };
  });
  const doc = {
    request: {
      '@_version': '1.1',
      username: '{{USERNAME}}',
      password: '{{PASSWORD}}',
      hotel: { '@_hotel_id': '{{HOTEL_ID}}', room: rooms },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

// ── OTA Rate ──────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function previewOtaRates(updates: RateUpdate[]): string {
  const echoToken = uniqueEchoToken();
  const ratePlans = updates.map(u => {
    const dowAttrs: Record<string, 'true' | 'false'> = {};
    for (let i = 0; i < 7; i++) {
      dowAttrs[`@_${DOW[i]}`] = (!u.daysOfWeek || u.daysOfWeek.includes(i)) ? 'true' : 'false';
    }
    const guestAmts = u.priceByOccupancy
      ? Object.entries(u.priceByOccupancy).map(([g, p]) => ({
          '@_AmountAfterTax': p.toFixed(2), '@_CurrencyCode': u.currency,
          '@_DecimalPlaces': 2, '@_NumberOfGuests': Number(g),
        }))
      : [{ '@_AmountAfterTax': u.price.toFixed(2), '@_CurrencyCode': u.currency, '@_DecimalPlaces': 2 }];
    return {
      '@_RatePlanNotifType': 'Delta', '@_RatePlanCode': u.ratePlanId,
      Rates: {
        Rate: {
          StatusApplicationControl: {
            '@_Start': u.dateFrom, '@_End': u.dateTo,
            '@_InvTypeCode': u.roomId, '@_RatePlanCode': u.ratePlanId, ...dowAttrs,
          },
          BaseByGuestAmts: { BaseByGuestAmt: guestAmts },
        },
      },
    };
  });
  return otaEnvelope('HotelRateAmountNotif', echoToken, { RatePlans: { RatePlan: ratePlans } });
}

// ── OTA Availability ──────────────────────────────────────────────────────

export function previewOtaAvailability(updates: AvailabilityUpdate[]): string {
  const echoToken = uniqueEchoToken();
  const messages = updates.map(u => {
    const msg: Record<string, unknown> = {
      StatusApplicationControl: {
        '@_Start': u.dateFrom, '@_End': u.dateTo, '@_InvTypeCode': u.roomId,
        ...(u.ratePlanId ? { '@_RatePlanCode': u.ratePlanId } : {}),
      },
    };
    const losNodes: unknown[] = [];
    if (u.minStay) losNodes.push({ '@_MinMaxMessageType': 'SetMinLOS', '@_Time': u.minStay });
    if (u.maxStay) losNodes.push({ '@_MinMaxMessageType': 'SetMaxLOS', '@_Time': u.maxStay });
    if (losNodes.length) msg['LengthsOfStay'] = { LengthOfStay: losNodes };
    let status = 'Open';
    if (u.closed) status = 'Close';
    else if (u.closedOnArrival) status = 'ClosedOnArrival';
    else if (u.closedOnDeparture) status = 'ClosedOnDeparture';
    const rAttr: Record<string, unknown> = { '@_Status': status };
    if (u.minAdvanceBookingDays) rAttr['@_MinAdvancedBookingOffset'] = `${u.minAdvanceBookingDays}D`;
    if (u.maxAdvanceBookingDays) rAttr['@_MaxAdvancedBookingOffset'] = `${u.maxAdvanceBookingDays}D`;
    msg['RestrictionStatus'] = rAttr;
    msg['BookingLimit'] = Math.min(u.roomsToSell, 254);
    return msg;
  });
  return otaEnvelope('HotelAvailNotif', echoToken, {
    AvailStatusMessages: { '@_HotelCode': '{{HOTEL_ID}}', AvailStatusMessage: messages },
  });
}

// ── B.XML Reservation pull request ───────────────────────────────────────

export function previewBxmlReservationPull(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<request version="1.0">
  <username>{{USERNAME}}</username>
  <password>{{PASSWORD}}</password>
  <hotel_id>{{HOTEL_ID}}</hotel_id>
</request>`;
}

// ── OTA Reservation acknowledge ───────────────────────────────────────────

export function previewOtaReservationAck(reservationIds: string[]): string {
  const echoToken = uniqueEchoToken();
  const acks = reservationIds.map(id => ({
    UniqueID: { '@_Type': '14', '@_ID': id },
    ResStatus: 'Acknowledged',
  }));
  const doc = {
    OTA_HotelResNotifRS: {
      '@_xmlns': 'http://www.opentravel.org/OTA/2003/05',
      '@_Version': '8.000',
      '@_EchoToken': echoToken,
      '@_TimeStamp': new Date().toISOString(),
      Success: '',
      HotelReservations: { HotelReservation: acks },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(doc)}`;
}

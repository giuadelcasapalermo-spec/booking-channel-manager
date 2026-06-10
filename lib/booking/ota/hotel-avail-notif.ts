/**
 * OTA_HotelAvailNotif
 * Sends availability + restriction updates in OTA 2003B format.
 * Endpoint: POST https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif
 */
import { otaEnvelope, uniqueEchoToken, parseOTAResponse } from '../xml';
import { authHeaders } from '../auth';
import type { AvailabilityUpdate, ARIResult } from '../types';

const ENDPOINT = () =>
  `${process.env.BOOKING_ARI_BASE ?? 'https://supply-xml.booking.com'}/hotels/ota/OTA_HotelAvailNotif`;

function buildPayload(updates: AvailabilityUpdate[]): unknown {
  const messages = updates.map(u => {
    const msg: Record<string, unknown> = {
      StatusApplicationControl: {
        '@_Start': u.dateFrom,
        '@_End': u.dateTo,
        '@_InvTypeCode': u.roomId,
        ...(u.ratePlanId ? { '@_RatePlanCode': u.ratePlanId } : {}),
      },
    };

    // Length of stay restrictions
    const losNodes: unknown[] = [];
    if (u.minStay !== undefined) {
      losNodes.push({ '@_MinMaxMessageType': 'SetMinLOS', '@_Time': u.minStay });
    }
    if (u.maxStay !== undefined) {
      losNodes.push({ '@_MinMaxMessageType': 'SetMaxLOS', '@_Time': u.maxStay });
    }
    if (losNodes.length > 0) {
      msg['LengthsOfStay'] = { LengthOfStay: losNodes };
    }

    // Open/Close restrictions
    let status = 'Open';
    if (u.closed) status = 'Close';
    else if (u.closedOnArrival) status = 'ClosedOnArrival';
    else if (u.closedOnDeparture) status = 'ClosedOnDeparture';

    const restrictionAttr: Record<string, unknown> = { '@_Status': status };
    if (u.minAdvanceBookingDays !== undefined) {
      restrictionAttr['@_MinAdvancedBookingOffset'] = `${u.minAdvanceBookingDays}D`;
    }
    if (u.maxAdvanceBookingDays !== undefined) {
      restrictionAttr['@_MaxAdvancedBookingOffset'] = `${u.maxAdvanceBookingDays}D`;
    }
    msg['RestrictionStatus'] = restrictionAttr;

    // Inventory (rooms to sell; 255 = unlimited)
    msg['BookingLimit'] = Math.min(u.roomsToSell, 254);

    return msg;
  });

  return {
    AvailStatusMessages: {
      '@_HotelCode': process.env.BOOKING_HOTEL_ID ?? '',
      AvailStatusMessage: messages,
    },
  };
}

export async function sendHotelAvailNotif(updates: AvailabilityUpdate[]): Promise<ARIResult> {
  const echoToken = uniqueEchoToken();
  const xml = otaEnvelope('HotelAvailNotif', echoToken, buildPayload(updates));

  if (process.env.BOOKING_MOCK_MODE === 'true') {
    return { ok: true, requestId: echoToken };
  }

  const res = await fetch(ENDPOINT(), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/xml' },
    body: xml,
  });

  const text = await res.text();
  const result = parseOTAResponse(text, 'OTA_HotelAvailNotifRS');
  return { ...result, requestId: echoToken };
}

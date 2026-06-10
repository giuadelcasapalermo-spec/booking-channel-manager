/**
 * Scenari di errore — simulano risposte di errore da Booking.com.
 * Attivati passando { mockError: "SCENARIO" } nel body delle chiamate mock.
 */

export type MockErrorScenario =
  | 'OVERBOOKING'
  | 'INVALID_DATE_RANGE'
  | 'UNKNOWN_ROOM'
  | 'UNKNOWN_RATE_PLAN'
  | 'RATE_BELOW_MINIMUM'
  | 'RATE_LIMIT_EXCEEDED'
  | 'AUTH_FAILED'
  | 'HOTEL_NOT_FOUND';

export interface MockError {
  code: string;
  httpStatus: number;
  otaCode: string;
  message: string;
  /** Risposta XML OTA di errore */
  otaXml: (echoToken: string, messageType: string) => string;
  /** Risposta B.XML di errore */
  bxmlXml: string;
}

const ERR = (
  code: string,
  httpStatus: number,
  otaCode: string,
  message: string
): MockError => ({
  code,
  httpStatus,
  otaCode,
  message,
  otaXml: (echoToken, messageType) => `<?xml version="1.0" encoding="UTF-8"?>
<OTA_${messageType}RS
  xmlns="http://www.opentravel.org/OTA/2003/05"
  Version="8.000"
  EchoToken="${echoToken}"
  TimeStamp="${new Date().toISOString()}"
>
  <Errors>
    <Error Type="12" Code="${otaCode}" ShortText="${message}"/>
  </Errors>
</OTA_${messageType}RS>`,
  bxmlXml: `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <error code="${otaCode}">${message}</error>
</response>`,
});

export const MOCK_ERRORS: Record<MockErrorScenario, MockError> = {
  OVERBOOKING: ERR(
    'OVERBOOKING',
    409,
    '325',
    'Dates not available: room already booked for the requested period'
  ),
  INVALID_DATE_RANGE: ERR(
    'INVALID_DATE_RANGE',
    400,
    '321',
    'Invalid date range: checkout must be after checkin'
  ),
  UNKNOWN_ROOM: ERR(
    'UNKNOWN_ROOM',
    422,
    '450',
    'Room type code not found: the InvTypeCode does not match any room in this property'
  ),
  UNKNOWN_RATE_PLAN: ERR(
    'UNKNOWN_RATE_PLAN',
    422,
    '451',
    'Rate plan code not found: the RatePlanCode does not match any rate plan in this property'
  ),
  RATE_BELOW_MINIMUM: ERR(
    'RATE_BELOW_MINIMUM',
    422,
    '400',
    'Rate rejected: price is below the minimum allowed rate for this room type'
  ),
  RATE_LIMIT_EXCEEDED: ERR(
    'RATE_LIMIT_EXCEEDED',
    429,
    '999',
    'Too many requests: please wait at least 20 seconds between reservation pull calls'
  ),
  AUTH_FAILED: ERR(
    'AUTH_FAILED',
    401,
    '001',
    'Authentication failed: invalid username or password'
  ),
  HOTEL_NOT_FOUND: ERR(
    'HOTEL_NOT_FOUND',
    404,
    '430',
    'Hotel not found: the hotel_id does not exist or you do not have access to it'
  ),
};

export function getError(scenario: string): MockError | undefined {
  return MOCK_ERRORS[scenario as MockErrorScenario];
}

export const ERROR_SCENARIO_LIST = Object.keys(MOCK_ERRORS) as MockErrorScenario[];

// Human-readable descriptions for the UI
export const ERROR_DESCRIPTIONS: Record<MockErrorScenario, string> = {
  OVERBOOKING: 'Camera già occupata nelle date richieste',
  INVALID_DATE_RANGE: 'Check-out prima del check-in',
  UNKNOWN_ROOM: 'Codice camera non trovato',
  UNKNOWN_RATE_PLAN: 'Codice rate plan non trovato',
  RATE_BELOW_MINIMUM: 'Prezzo sotto il minimo consentito',
  RATE_LIMIT_EXCEEDED: 'Troppe richieste (rate limit 20s)',
  AUTH_FAILED: 'Credenziali errate',
  HOTEL_NOT_FOUND: 'Hotel ID non trovato',
};

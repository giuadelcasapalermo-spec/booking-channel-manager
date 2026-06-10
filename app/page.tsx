'use client';
import { useState, useEffect, useCallback } from 'react';

type Tab = 'bap' | 'rates' | 'availability' | 'reservations' | 'polling' | 'webhook' | 'mockserver' | 'mock' | 'checklist';

const TABS: { key: Tab; label: string }[] = [
  { key: 'bap', label: 'BAP' },
  { key: 'rates', label: 'R&A Tariffe' },
  { key: 'availability', label: 'R&A Disponibilità' },
  { key: 'reservations', label: 'BRS Prenotazioni' },
  { key: 'polling', label: 'Polling Live' },
  { key: 'webhook', label: 'Webhook' },
  { key: 'mockserver', label: 'Mock Server' },
  { key: 'mock', label: 'Mock / Test' },
  { key: 'checklist', label: 'Checklist' },
];

interface PollLogEntry {
  ts: string;
  pulled: number;
  format: string;
  durationMs: number;
  error?: string;
  ids: string[];
}

interface PollState {
  lastPollAt: string | null;
  pendingCount: number;
  lastError: string | null;
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('mock');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const [pollLog, setPollLog] = useState<PollLogEntry[]>([]);
  const [pollState, setPollStateLocal] = useState<PollState>({ lastPollAt: null, pendingCount: 0, lastError: null });

  const call = useCallback(async (path: string, body?: unknown) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(path, {
        method: body !== undefined ? 'POST' : 'GET',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: String(e) });
    }
    setLoading(false);
  }, []);

  const refreshLog = useCallback(async () => {
    try {
      const res = await fetch('/api/reservations/log');
      const data = await res.json();
      setPollLog(data.log ?? []);
      setPollStateLocal(data.pollState ?? { lastPollAt: null, pendingCount: 0, lastError: null });
    } catch { /* silent */ }
  }, []);

  // auto-refresh log every 5s
  useEffect(() => {
    refreshLog();
    const id = setInterval(refreshLog, 5_000);
    return () => clearInterval(id);
  }, [refreshLog]);

  // auto-poll ogni 20s
  useEffect(() => {
    if (!autoPoll) return;
    const doPoll = () => fetch('/api/reservations/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'bxml', acknowledge: true }),
    }).then(() => refreshLog());
    doPoll();
    const id = setInterval(doPoll, 20_000);
    return () => clearInterval(id);
  }, [autoPoll, refreshLog]);

  const simulateWebhookPush = useCallback(async () => {
    // Prendi l'XML della prima prenotazione mock e invialo al webhook locale
    const mockRes = await fetch('/api/mock/reservation?id=BK-001-2026');
    const { xml } = await mockRes.json();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/webhook/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml,
      });
      const text = await res.text();
      setResult({ status: res.status, body: text });
      await refreshLog();
    } catch (e) {
      setResult({ error: String(e) });
    }
    setLoading(false);
  }, [refreshLog]);

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Booking.com Channel Manager
        </h1>
        <StatusBadge pollState={pollState} autoPoll={autoPoll} />
      </div>
      <p style={{ color: '#6c757d', marginBottom: 24, fontSize: 13 }}>
        Ambiente di sviluppo — BOOKING_MOCK_MODE attivo
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '2px solid #dee2e6', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setResult(null); }}
            style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
              borderBottom: tab === t.key ? '2px solid #003580' : '2px solid transparent',
              color: tab === t.key ? '#003580' : '#495057',
              background: 'transparent', fontWeight: tab === t.key ? 600 : 400,
              marginBottom: -2,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* BAP */}
      {tab === 'bap' && (
        <Section title="BAP — Gestione Connessioni">
          <Row label="Lista connessioni" onRun={() => call('/api/bap')} />
          <Row label="Crea connessione test" onRun={() => call('/api/bap', {
            hotelId: 'hotel-test-001',
            channelManagerName: 'My Channel Manager v1',
            permissions: ['ari', 'reservations'],
          })} />
          <Row label="Sospendi connessione (PUT)" onRun={() => call('/api/bap')} />
        </Section>
      )}

      {/* Rates */}
      {tab === 'rates' && (
        <Section title="R&A — Aggiornamento Tariffe">
          <Row label="Tariffe standard — lun-ven €120, sab-dom €160 (B.XML)" onRun={() => call('/api/mock/ari', { scenario: 'STANDARD_RATES', format: 'bxml' })} />
          <Row label="Tariffe standard (OTA_HotelRateAmountNotif)" onRun={() => call('/api/mock/ari', { scenario: 'STANDARD_RATES', format: 'ota' })} />
          <Row label="Tariffe per occupazione 1-4 persone (B.XML)" onRun={() => call('/api/mock/ari', { scenario: 'OCCUPANCY_RATES', format: 'bxml' })} />
          <Row label="Tariffe per occupazione (OTA)" onRun={() => call('/api/mock/ari', { scenario: 'OCCUPANCY_RATES', format: 'ota' })} />
        </Section>
      )}

      {/* Availability */}
      {tab === 'availability' && (
        <Section title="R&A — Disponibilità e Restrizioni">
          <Row label="Chiudi camera per manutenzione — chiusura totale (B.XML)" onRun={() => call('/api/mock/ari', { scenario: 'CLOSE_ROOM', format: 'bxml' })} />
          <Row label="Min stay 3 notti in arrivo (OTA_HotelAvailNotif)" onRun={() => call('/api/mock/ari', { scenario: 'MIN_STAY_WEEKEND', format: 'ota' })} />
          <Row label="Apri tutto — 90 giorni, illimitato (B.XML)" onRun={() => call('/api/mock/ari', { scenario: 'OPEN_ALL', format: 'bxml' })} />
          <Row label="Apri tutto (OTA)" onRun={() => call('/api/mock/ari', { scenario: 'OPEN_ALL', format: 'ota' })} />
        </Section>
      )}

      {/* Reservations */}
      {tab === 'reservations' && (
        <Section title="BRS — Prenotazioni">
          <Row label="Pull + Ack (B.XML mock)" onRun={() => call('/api/reservations/pull', { format: 'bxml', acknowledge: true })} />
          <Row label="Pull + Ack (OTA mock)" onRun={() => call('/api/reservations/pull', { format: 'ota', acknowledge: true })} />
          <Row label="Lista tutte le prenotazioni in store" onRun={() => call('/api/reservations')} />
          <Row label="Solo nuove" onRun={() => call('/api/reservations?status=new')} />
          <Row label="Solo modificate" onRun={() => call('/api/reservations?status=modified')} />
          <Row label="Solo cancellate" onRun={() => call('/api/reservations?status=cancelled')} />
          <Row label="Svuota store (reset test)" onRun={async () => {
            await fetch('/api/reservations/clear', { method: 'DELETE' });
            await call('/api/reservations');
          }} />
        </Section>
      )}

      {/* Polling Live */}
      {tab === 'polling' && (
        <Section title="Polling Live — BRS ogni 20 secondi">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <button
              onClick={() => setAutoPoll(p => !p)}
              style={{
                padding: '10px 20px', border: 'none', cursor: 'pointer', borderRadius: 6,
                background: autoPoll ? '#dc3545' : '#003580', color: '#fff', fontWeight: 600, fontSize: 14,
              }}
            >
              {autoPoll ? 'Ferma Auto-Poll' : 'Avvia Auto-Poll (20s)'}
            </button>
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              {autoPoll ? 'Polling attivo — prossima chiamata entro 20s' : 'Polling fermo'}
            </span>
          </div>

          <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            <strong>Stato:</strong>{' '}
            Ultimo pull: {pollState.lastPollAt ? new Date(pollState.lastPollAt).toLocaleTimeString('it-IT') : 'mai'}{' '}
            | Prenotazioni: {pollState.pendingCount}
            {pollState.lastError && <span style={{ color: '#dc3545' }}> | Errore: {pollState.lastError}</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => call('/api/reservations/pull', { format: 'bxml' })}
              style={{ padding: '6px 14px', background: '#003580', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
              Pull manuale (B.XML)
            </button>
            <button onClick={async () => { await fetch('/api/reservations/log', { method: 'DELETE' }); refreshLog(); }}
              style={{ padding: '6px 14px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
              Cancella log
            </button>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Log poll (ultimi {pollLog.length})</h3>
          {pollLog.length === 0
            ? <p style={{ color: '#6c757d', fontSize: 13 }}>Nessun poll eseguito ancora.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pollLog.map((entry, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'center', padding: '6px 10px',
                    background: entry.error ? '#fff5f5' : '#f8f9fa', borderRadius: 4,
                    border: `1px solid ${entry.error ? '#f5c6cb' : '#dee2e6'}`, fontSize: 12,
                  }}>
                    <span style={{ color: '#6c757d', minWidth: 80 }}>{new Date(entry.ts).toLocaleTimeString('it-IT')}</span>
                    <span style={{ minWidth: 80 }}>{entry.format}</span>
                    <span style={{ color: entry.error ? '#dc3545' : '#28a745', fontWeight: 600 }}>
                      {entry.error ? `ERRORE` : `${entry.pulled} prenotazioni`}
                    </span>
                    <span style={{ color: '#6c757d' }}>{entry.durationMs}ms</span>
                    {entry.ids.length > 0 && <span style={{ color: '#495057' }}>{entry.ids.join(', ')}</span>}
                    {entry.error && <span style={{ color: '#dc3545' }}>{entry.error}</span>}
                  </div>
                ))}
              </div>
            )
          }
        </Section>
      )}

      {/* Webhook */}
      {tab === 'webhook' && (
        <Section title="Webhook — Ricezione Push da Booking.com">
          <div style={{ background: '#e8f0fe', border: '1px solid #c5d8f0', borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 13 }}>
            <strong>Come configurare:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Accedi a <strong>connect.booking.com</strong> con il tuo machine account</li>
              <li>Vai su <em>Connectivity Settings → Notification URL</em></li>
              <li>Imposta: <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3 }}>https://&lt;tuo-dominio&gt;/api/webhook/booking</code></li>
              <li>Copia il <strong>webhook secret</strong> generato e mettilo in <code>.env.local</code> come <code>BOOKING_WEBHOOK_SECRET=xxx</code></li>
            </ol>
          </div>

          <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 13 }}>
            <strong>Endpoint locale:</strong>{' '}
            <code>POST /api/webhook/booking</code>
            <br />
            <strong>Formati accettati:</strong> B.XML, OTA_HotelResNotifRQ
            <br />
            <strong>Autenticazione:</strong> HMAC-SHA256 via header <code>X-Booking-Signature</code>
            <br />
            <strong>Risposta ACK:</strong> 200 XML (B.XML: <code>&lt;acknowledged&gt;1&lt;/acknowledged&gt;</code> / OTA: <code>&lt;Success/&gt;</code>)
          </div>

          <Row label="Info webhook (GET /api/webhook/booking)" onRun={() => call('/api/webhook/booking')} />
          <Row label="Simula push B.XML — prenotazione BK-001-2026" onRun={simulateWebhookPush} />
          <Row label="Simula push OTA — prenotazione BK-002-2026" onRun={async () => {
            const mockRes = await fetch('/api/mock/reservation?id=BK-002-2026');
            const { xml } = await mockRes.json();
            setLoading(true);
            setResult(null);
            try {
              const res = await fetch('/api/webhook/booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xml,
              });
              const text = await res.text();
              setResult({ status: res.status, body: text });
              await refreshLog();
            } catch (e) {
              setResult({ error: String(e) });
            }
            setLoading(false);
          }} />
        </Section>
      )}

      {/* Mock Server */}
      {tab === 'mockserver' && (
        <MockServerTab call={call} />
      )}

      {/* Mock */}
      {tab === 'mock' && (
        <Section title="Mock — Scenari di Test XML">
          <Row label="Lista scenari ARI disponibili" onRun={() => call('/api/mock/ari')} />
          <Row label="Lista prenotazioni mock" onRun={() => call('/api/mock/reservation')} />
          <Row label="XML B.XML di BK-001-2026 (nuova, 2 adulti, 3 notti)" onRun={() => call('/api/mock/reservation?id=BK-001-2026')} />
          <Row label="XML B.XML di BK-002-2026 (2 adulti + 2 bambini)" onRun={() => call('/api/mock/reservation?id=BK-002-2026')} />
          <Row label="XML B.XML di BK-003-2026 (modificata)" onRun={() => call('/api/mock/reservation?id=BK-003-2026')} />
          <Row label="XML B.XML di BK-004-2026 (cancellata, penale maturata)" onRun={() => call('/api/mock/reservation?id=BK-004-2026')} />
          <Row label="XML B.XML di BK-005-2026 (last-minute, tasso flex)" onRun={() => call('/api/mock/reservation?id=BK-005-2026')} />
          <Row label="XML B.XML di BK-006-2026 (non rimborsabile, penale 100%)" onRun={() => call('/api/mock/reservation?id=BK-006-2026')} />
          <Row label="XML B.XML di BK-007-2026 (internazionale, dati minimali)" onRun={() => call('/api/mock/reservation?id=BK-007-2026')} />
          <Row label="Round-trip: XML → parse → JSON (BK-002-2026)" onRun={async () => {
            const mockRes = await fetch('/api/mock/reservation?id=BK-002-2026');
            const { xml } = await mockRes.json();
            await call('/api/mock/reservation', { xml });
          }} />
        </Section>
      )}

      {/* Checklist */}
      {tab === 'checklist' && (
        <Section title="Checklist Certificazione Booking.com">
          <div style={{ fontSize: 13, color: '#6c757d', marginBottom: 16 }}>
            Requisiti minimi per ottenere la certificazione Connectivity Partner.
          </div>
          <CheckGroup label="BAP — Booking Acquisition Portal">
            <CheckItem ok label="Gestione connessioni (crea, lista, sospendi)" />
            <CheckItem ok label="Stato connessione: pending → active → suspended → revoked" />
            <CheckItem warn label="Flusso OAuth reale (richiede machine account su connect.booking.com)" />
          </CheckGroup>
          <CheckGroup label="R&A — Rates & Availability (B.XML)">
            <CheckItem ok label="Push tariffe giornaliere per camera e piano tariffario" />
            <CheckItem ok label="Push tariffe per occupazione (1-4 persone)" />
            <CheckItem ok label="Push tariffe per giorni della settimana (lun-ven / sab-dom)" />
            <CheckItem ok label="Push disponibilità: roomsToSell, closed, closedOnArrival, closedOnDeparture" />
            <CheckItem ok label="Restrizioni: minStay, maxStay, minStayArrival, maxAdvanceBookingDays" />
          </CheckGroup>
          <CheckGroup label="R&A — Rates & Availability (OTA)">
            <CheckItem ok label="OTA_HotelRateAmountNotif — aggiornamento tariffe" />
            <CheckItem ok label="OTA_HotelAvailNotif — aggiornamento disponibilità/restrizioni" />
          </CheckGroup>
          <CheckGroup label="BRS — Booking Reservation System (B.XML)">
            <CheckItem ok label="Pull prenotazioni (nuove, modificate, cancellate)" />
            <CheckItem ok label="Acknowledge automatico dopo ogni pull (reservationAck)" />
            <CheckItem ok label="Parsing: adulti, bambini, età bambini, city tax, commissioni" />
            <CheckItem ok label="Parsing: penali di cancellazione" />
          </CheckGroup>
          <CheckGroup label="BRS — Booking Reservation System (OTA)">
            <CheckItem ok label="GET OTA_HotelResNotif — pull prenotazioni" />
            <CheckItem ok label="POST OTA_HotelResNotif — acknowledge" />
            <CheckItem ok label="Parsing completo OTA (RoomStay, ResGuests, GuestCounts)" />
          </CheckGroup>
          <CheckGroup label="Webhook Push (ricezione passiva)">
            <CheckItem ok label="Endpoint POST /api/webhook/booking" />
            <CheckItem ok label="Auto-detect formato (B.XML vs OTA)" />
            <CheckItem ok label="Verifica firma HMAC-SHA256 (X-Booking-Signature)" />
            <CheckItem ok label="Risposta ACK corretta (200 XML)" />
          </CheckGroup>
          <CheckGroup label="Persistenza e infrastruttura">
            <CheckItem ok label="File store (sopravvive ai hot-reload Next.js)" />
            <CheckItem ok label="Poll log (ultimi 100 eventi)" />
            <CheckItem ok label="Auto-poll 20s con toggle" />
            <CheckItem warn label="Database PostgreSQL (Neon) — necessario per produzione" />
            <CheckItem warn label="Cron job server-side — necessario per polling in produzione" />
          </CheckGroup>
          <CheckGroup label="Accesso reale Booking.com">
            <CheckItem warn label="Machine account su connect.booking.com" />
            <CheckItem warn label="Test property configurata nel portale" />
            <CheckItem warn label="Credenziali BOOKING_USERNAME / BOOKING_PASSWORD in .env" />
            <CheckItem warn label="RUID (Request Unique ID) documentati per la certificazione" />
          </CheckGroup>
        </Section>
      )}

      {/* Result */}
      {loading && <p style={{ color: '#6c757d', marginTop: 16 }}>Caricamento…</p>}
      {result !== null && !loading && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Risposta:</h3>
          <pre style={{
            background: '#212529', color: '#f8f9fa', padding: 16, borderRadius: 8,
            fontSize: 12, overflowX: 'auto', maxHeight: 480, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Componenti UI ──────────────────────────────────────────────────────────

function StatusBadge({ pollState, autoPoll }: { pollState: PollState; autoPoll: boolean }) {
  const hasError = !!pollState.lastError;
  const color = hasError ? '#dc3545' : autoPoll ? '#28a745' : '#6c757d';
  const label = hasError ? 'Errore poll' : autoPoll ? 'Polling attivo' : 'Mock mode';
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
      background: color + '1a', color, border: `1px solid ${color}40`,
      fontSize: 12, fontWeight: 600,
    }}>{label}</span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#003580' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Row({ label, onRun }: { label: string; onRun: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', padding: '10px 14px', borderRadius: 6, border: '1px solid #dee2e6' }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <button
        onClick={onRun}
        style={{ padding: '6px 14px', background: '#003580', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
      >
        Esegui
      </button>
    </div>
  );
}

function CheckGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#003580', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #dee2e6' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function CheckItem({ label, ok, warn }: { label: string; ok?: boolean; warn?: boolean }) {
  const icon = ok ? '✓' : warn ? '⚠' : '✗';
  const color = ok ? '#28a745' : warn ? '#fd7e14' : '#dc3545';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0', fontSize: 13 }}>
      <span style={{ color, fontWeight: 700, minWidth: 16, marginTop: 1 }}>{icon}</span>
      <span style={{ color: ok ? '#212529' : warn ? '#664d03' : '#842029' }}>{label}</span>
    </div>
  );
}

// ── Mock Server Tab ────────────────────────────────────────────────────────

interface MockServerStatus {
  acknowledged: string[];
  pending: { id: string; status: string }[];
  ariLog: { ts: string; hotelId: string; roomCount: number; valid: boolean; error?: string }[];
  tokenCalls: number;
  totalReservations: number;
}

function MockServerTab({ call }: { call: (path: string, body?: unknown) => Promise<void> }) {
  const [status, setStatus] = useState<MockServerStatus | null>(null);
  const BASE = '/api/mock/booking-server';

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/status`);
      setStatus(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3_000);
    return () => clearInterval(id);
  }, [refresh]);

  const reset = async () => {
    await fetch(`${BASE}/reset`, { method: 'POST' });
    refresh();
  };

  return (
    <div>
      <div style={{ background: '#e8f0fe', border: '1px solid #c5d8f0', borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 13 }}>
        <strong>Come usare il Mock Server invece del vero Booking.com</strong>
        <p style={{ margin: '8px 0 4px 0' }}>Aggiungi a <code>.env.local</code>:</p>
        <pre style={{ background: '#fff', padding: 10, borderRadius: 4, fontSize: 12, margin: 0 }}>{`BOOKING_MOCK_MODE=false
BOOKING_ARI_BASE=http://localhost:3001/api/mock/booking-server
BOOKING_RES_BASE=http://localhost:3001/api/mock/booking-server
BOOKING_USERNAME=hotel-test-001
BOOKING_PASSWORD=test-password
BOOKING_HOTEL_ID=hotel-test-001`}</pre>
        <p style={{ margin: '8px 0 0 0', color: '#6c757d' }}>
          Con <code>MOCK_MODE=false</code> il codice farà chiamate HTTP reali verso questo server locale.
        </p>
      </div>

      {/* Stato del server */}
      {status && (
        <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Stat label="Prenotazioni totali" value={status.totalReservations} />
            <Stat label="Da confermare (pending)" value={status.pending.length} color={status.pending.length > 0 ? '#fd7e14' : '#28a745'} />
            <Stat label="Confermate (acked)" value={status.acknowledged.length} color="#28a745" />
            <Stat label="ARI push ricevuti" value={status.ariLog.length} />
            <Stat label="Token richiesti" value={status.tokenCalls} />
          </div>
          {status.pending.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#495057' }}>
              Pending: {status.pending.map(r => `${r.id} (${r.status})`).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Azioni */}
      <Section title="Azioni sul Mock Server">
        <Row label="Stato server (GET /status)" onRun={() => call(`${BASE}/status`)} />
        <Row label="Pull prenotazioni B.XML (GET /hotels/xml/reservations)" onRun={() => call(`${BASE}/hotels/xml/reservations`)} />
        <Row label="Pull prenotazioni OTA (GET /hotels/ota/OTA_HotelResNotif)" onRun={() => call(`${BASE}/hotels/ota/OTA_HotelResNotif`)} />
        <Row label="Token OAuth mock (POST /hotels/ota/token)" onRun={() => call(`${BASE}/hotels/ota/token`, {})} />
        <Row label="ARI push — tariffe standard via BXML (POST /hotels/xml/availability)" onRun={async () => {
          // Simula un push ARI come lo farebbe il Channel Manager
          const res = await fetch('/api/mock/ari', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario: 'STANDARD_RATES', format: 'bxml' }),
          });
          const data = await res.json();
          // Mostra il risultato direttamente
          call(`${BASE}/status`);
        }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={reset}
            style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Reset stato (azzera ack e log)
          </button>
          <span style={{ fontSize: 12, color: '#6c757d', alignSelf: 'center' }}>
            Usa reset per ripetere il ciclo pull → ack dall&#39;inizio
          </span>
        </div>
      </Section>

      {/* ARI Log */}
      {status && status.ariLog.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#003580' }}>Log ARI push ricevuti</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {status.ariLog.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '6px 10px',
                background: entry.valid ? '#f8f9fa' : '#fff5f5', borderRadius: 4,
                border: `1px solid ${entry.valid ? '#dee2e6' : '#f5c6cb'}`, fontSize: 12,
              }}>
                <span style={{ color: '#6c757d', minWidth: 80 }}>{new Date(entry.ts).toLocaleTimeString('it-IT')}</span>
                <span style={{ color: entry.valid ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                  {entry.valid ? '✓' : '✗'} {entry.valid ? 'OK' : 'ERRORE'}
                </span>
                <span>Hotel: {entry.hotelId || '—'}</span>
                <span>{entry.roomCount} camere</span>
                {entry.error && <span style={{ color: '#dc3545' }}>{entry.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? '#212529' }}>{value}</div>
    </div>
  );
}


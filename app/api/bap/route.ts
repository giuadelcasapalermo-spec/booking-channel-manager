/**
 * BAP — Booking Acquisition Portal
 *
 * In produzione il flusso BAP avviene sul portale connect.booking.com,
 * non via API diretta. Questa route simula la gestione delle connessioni
 * (lista, attiva, sospendi) come se fossero già state autorizzate dal portale.
 *
 * Endpoints:
 *   GET  /api/bap          → lista connessioni
 *   POST /api/bap          → crea/attiva connessione
 *   PUT  /api/bap          → aggiorna stato connessione
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { listConnections, upsertConnection, getConnection } from '@/lib/db/store';
import type { BAPConnection } from '@/lib/booking/types';

export async function GET(): Promise<Response> {
  const connections = listConnections();
  return Response.json({ connections });
}

const CreateSchema = z.object({
  hotelId: z.string().min(1),
  channelManagerName: z.string().default('My Channel Manager'),
  permissions: z.array(z.enum(['ari', 'reservations', 'content'])).default(['ari', 'reservations']),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { hotelId, channelManagerName, permissions } = parsed.data;
  const connectionId = `conn-${hotelId}-${Date.now()}`;

  const conn: BAPConnection = {
    connectionId,
    hotelId,
    channelManagerName,
    status: 'active',
    createdAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    permissions,
  };

  upsertConnection(conn);
  return Response.json({ connection: conn }, { status: 201 });
}

const UpdateSchema = z.object({
  connectionId: z.string().min(1),
  status: z.enum(['active', 'suspended', 'revoked']),
});

export async function PUT(req: NextRequest): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = getConnection(parsed.data.connectionId);
  if (!existing) return Response.json({ error: 'connection not found' }, { status: 404 });

  const updated: BAPConnection = { ...existing, status: parsed.data.status };
  upsertConnection(updated);
  return Response.json({ connection: updated });
}

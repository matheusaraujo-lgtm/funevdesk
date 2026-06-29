import { getDb } from "@/lib/db";
import { findAssetByToken } from "@/lib/agent";
import { createAgentTicket, listAgentTickets } from "@/lib/agent-tickets";
import { z } from "zod";

export const dynamic = "force-dynamic";

function getAsset(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  return findAssetByToken(getDb(), token);
}

export async function GET(request) {
  const asset = getAsset(request);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });
  const includeResolved = new URL(request.url).searchParams.get("includeResolved") === "1";
  const tickets = listAgentTickets(getDb(), asset, { includeResolved });
  return Response.json({ tickets });
}

export async function POST(request) {
  const asset = getAsset(request);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const parsed = z.object({
    title: z.string().min(5).max(160),
    description: z.string().min(5).max(5000),
    category: z.string().min(2).max(80).optional(),
    kind: z.enum(["INCIDENTE", "REQUISICAO"]).optional(),
    priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
    ticketTypeId: z.string().min(1).optional(),
    answers: z.array(z.object({
      fieldId: z.string().min(1),
      value: z.string().max(5000),
    })).optional().default([]),
    originBranchId: z.string().optional(),
    locationId: z.string().optional(),
    attachments: z.array(z.object({
      fieldId: z.string().optional(),
      originalName: z.string(),
      storedName: z.string(),
      mimeType: z.string().optional(),
      sizeBytes: z.number().optional(),
      publicUrl: z.string().optional(),
    })).optional().default([]),
    term: z.object({
      signerName: z.string().min(3).max(160).optional(),
      signerDocument: z.string().max(80).optional(),
      signatureText: z.string().min(3).max(240),
    }).optional(),
  }).safeParse(await request.json());

  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const result = createAgentTicket(getDb(), asset, parsed.data);
  if (result.error) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json({ id: result.id, number: result.number }, { status: result.status || 201 });
}

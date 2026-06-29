import { createNotification } from "@/lib/notifications";
import { getTicketStatusMeta, isResolvedStatus, listTicketStatuses, statusAllowsMessages } from "@/lib/ticket-statuses";
import { computeSlaDueAt, getSlaStatus } from "@/lib/sla";
import { runEscalationCheck } from "@/lib/escalation";
import { dispatchWebhooks } from "@/lib/webhooks";
import { isTicketTypeAvailableForBranch, resolveHandlingBranchId } from "@/lib/ticket-type-routing";
import { listCatalog } from "@/app/api/catalog/route";
import { makeId } from "@/lib/db";

export function resolveRequesterForAsset(db, asset) {
  if (!asset?.id) return null;
  return db.prepare("SELECT id, name, email FROM users WHERE asset_id=? AND COALESCE(active, 1)=1 LIMIT 1").get(asset.id) || null;
}

export function agentTicketScopeClause(alias = "t") {
  return `(${alias}.asset_id = ? OR ${alias}.requester_id IN (SELECT id FROM users WHERE asset_id = ?))`;
}

export function agentTicketScopeParams(asset) {
  return [asset.id, asset.id];
}

export function listAgentTickets(db, asset, { includeResolved = false } = {}) {
  let statusClause = "";
  const statusParams = [];
  if (!includeResolved) {
    const terminalCodes = listTicketStatuses(db, asset.organization_id)
      .filter((row) => row.is_terminal)
      .map((row) => row.code);
    if (terminalCodes.length) {
      statusClause = ` AND t.status NOT IN (${terminalCodes.map(() => "?").join(",")})`;
      statusParams.push(...terminalCodes);
    } else {
      statusClause = " AND t.status != 'RESOLVIDO'";
    }
  }
  return db.prepare(`
    SELECT t.id, t.number, t.title, t.status, t.priority, t.updated_at, t.created_at, t.source,
      tt.name AS ticket_type_name
    FROM tickets t
    LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE t.organization_id = ? AND ${agentTicketScopeClause("t")}${statusClause}
    ORDER BY t.updated_at DESC
  `).all(asset.organization_id, ...agentTicketScopeParams(asset), ...statusParams);
}

export function getAgentTicket(db, asset, ticketId) {
  return db.prepare(`
    SELECT t.*, tt.name AS ticket_type_name, assignee.name AS assignee_name
    FROM tickets t
    LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
    LEFT JOIN users assignee ON assignee.id = t.assignee_id
    WHERE t.id = ? AND t.organization_id = ? AND ${agentTicketScopeClause("t")}
  `).get(ticketId, asset.organization_id, ...agentTicketScopeParams(asset)) || null;
}

export function listAgentCatalog(db, asset) {
  return listCatalog(db, asset.organization_id)
    .filter((type) => type.active)
    .filter((type) => !type.requiresApproval)
    .filter((type) => type.allBranches || (type.branchIds || []).includes(asset.branch_id))
    .map((type) => {
      let termTemplateBody = null;
      if (type.requiresTerm && type.termTemplateId) {
        const template = db.prepare("SELECT body_text FROM term_templates WHERE id=?").get(type.termTemplateId);
        termTemplateBody = template?.body_text || null;
      }
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        category: type.category,
        kind: type.kind,
        defaultPriority: type.default_priority,
        requiresTerm: Boolean(type.requiresTerm),
        termTemplateId: type.termTemplateId,
        termTemplateBody,
        fields: type.fields,
      };
    });
}

export function listAgentNotifications(db, asset, since) {
  const sinceIso = since || "1970-01-01T00:00:00.000Z";
  const scope = agentTicketScopeClause("t");
  const scopeParams = agentTicketScopeParams(asset);

  const messages = db.prepare(`
    SELECT tm.id, tm.ticket_id, tm.body, tm.created_at, tm.message_type,
      t.number AS ticket_number, t.title AS ticket_title, tm.author_name
    FROM ticket_messages tm
    JOIN tickets t ON t.id = tm.ticket_id
    WHERE t.organization_id = ? AND ${scope}
      AND tm.visibility = 'PUBLIC'
      AND tm.author_id IS NOT NULL
      AND tm.created_at > ?
    ORDER BY tm.created_at ASC
  `).all(asset.organization_id, ...scopeParams, sinceIso);

  const statusChanges = db.prepare(`
    SELECT te.ticket_id, te.description, te.event_type, te.created_at,
      t.number AS ticket_number, t.title AS ticket_title, t.status
    FROM ticket_events te
    JOIN tickets t ON t.id = te.ticket_id
    WHERE t.organization_id = ? AND ${scope}
      AND te.event_type IN ('STATUS_CHANGED', 'ASSIGNED')
      AND te.created_at > ?
    ORDER BY te.created_at ASC
  `).all(asset.organization_id, ...scopeParams, sinceIso);

  const notifications = [
    ...messages.map((row) => ({
      type: row.message_type === "RESOLUTION" ? "TICKET_RESOLVED" : "TICKET_MESSAGE",
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      title: row.message_type === "RESOLUTION"
        ? `Chamado #${row.ticket_number} resolvido`
        : `Chamado #${row.ticket_number}`,
      body: row.body,
      authorName: row.author_name,
      createdAt: row.created_at,
    })),
    ...statusChanges.map((row) => {
      if (row.event_type === "ASSIGNED") {
        return {
          type: "TICKET_ASSIGNED",
          ticketId: row.ticket_id,
          ticketNumber: row.ticket_number,
          title: `Chamado #${row.ticket_number} em atendimento`,
          body: row.description || row.ticket_title,
          createdAt: row.created_at,
        };
      }
      const statusLabel = row.description?.replace(/^Situação alterada para /i, "") || row.status;
      return {
        type: row.status === "RESOLVIDO" ? "TICKET_RESOLVED" : "TICKET_STATUS",
        ticketId: row.ticket_id,
        ticketNumber: row.ticket_number,
        title: `Chamado #${row.ticket_number} — ${statusLabel}`,
        body: row.ticket_title,
        createdAt: row.created_at,
      };
    }),
  ];

  notifications.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return notifications;
}

export function createAgentTicket(db, asset, payload) {
  const settings = db.prepare("SELECT automatic_tickets_enabled, sla_hours FROM system_settings WHERE organization_id=?").get(asset.organization_id);
  if (settings && !settings.automatic_tickets_enabled) {
    return { error: "Abertura de chamados pelo agente desativada nas configurações.", status: 409 };
  }

  const requester = resolveRequesterForAsset(db, asset);
  const authorName = asset.logged_user?.includes("\\")
    ? asset.logged_user.split("\\").pop()
    : (asset.logged_user || asset.hostname);

  if (payload.ticketTypeId) {
    const ticketType = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(payload.ticketTypeId, asset.organization_id);
    if (!ticketType) return { error: "Tipo de chamado não encontrado ou inativo.", status: 404 };
    if (ticketType.requires_approval) {
      return { error: "Este tipo exige aprovação. Use o portal web.", status: 403 };
    }
    if (ticketType.requires_term) {
      if (!payload.term?.signatureText?.trim()) {
        return { error: "Assine o termo de equipamento para este tipo de chamado.", status: 400 };
      }
    }

    const typeBranchLinks = db.prepare("SELECT ticket_type_id, branch_id FROM ticket_type_branches WHERE ticket_type_id=?").all(ticketType.id);
    if (!isTicketTypeAvailableForBranch(ticketType, asset.branch_id, typeBranchLinks)) {
      return { error: "Este tipo de chamado não está disponível para esta unidade.", status: 403 };
    }

    const configuredFields = db.prepare("SELECT * FROM ticket_fields WHERE ticket_type_id=? ORDER BY position").all(ticketType.id);
    const answerMap = new Map((payload.answers || []).map((answer) => [answer.fieldId, answer.value]));
    for (const field of configuredFields) {
      if (!field.required) continue;
      if (["FILE", "SCREENSHOT"].includes(field.field_type)) {
        const attachment = (payload.attachments || []).find((item) => item.fieldId === field.id);
        if (!attachment?.storedName) {
          return { error: `O campo "${field.label}" exige um arquivo.`, status: 400 };
        }
        continue;
      }
      if (!answerMap.get(field.id)?.trim()) {
        return { error: `O campo "${field.label}" é obrigatório.`, status: 400 };
      }
    }

    const originBranchId = payload.originBranchId || asset.branch_id;
    // A unidade de origem (quando vem do payload do agente) precisa pertencer à org do ativo —
    // impede rotear o chamado para uma unidade de outra empresa.
    if (payload.originBranchId) {
      const validBranch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(payload.originBranchId, asset.organization_id);
      if (!validBranch) return { error: "Unidade de origem inválida.", status: 400 };
    }
    if (payload.locationId) {
      const loc = db.prepare("SELECT id FROM locations WHERE id=? AND organization_id=? AND branch_id=? AND active=1")
        .get(payload.locationId, asset.organization_id, originBranchId);
      if (!loc) return { error: "Localização inválida.", status: 400 };
    }
    const handlingBranchId = resolveHandlingBranchId(db, ticketType, originBranchId, asset.organization_id);
    const handlingBranch = db.prepare("SELECT id, name FROM branches WHERE id=?").get(handlingBranchId);
    const service = db.prepare("SELECT * FROM services WHERE ticket_type_id=? AND organization_id=? AND active=1 LIMIT 1").get(ticketType.id, asset.organization_id);
    const slaHours = service?.sla_hours || settings?.sla_hours || 8;
    const slaDueAt = computeSlaDueAt(slaHours, ticketType.default_priority);
    const slaStatus = getSlaStatus(slaDueAt, "ABERTO");
    const team = db.prepare("SELECT id FROM teams WHERE branch_id=? AND organization_id=? ORDER BY created_at LIMIT 1").get(handlingBranchId, asset.organization_id);
    const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
    const id = makeId("tkt");
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`INSERT INTO tickets
        (id, number, organization_id, branch_id, origin_branch_id, asset_id, requester_id, title, description,
         category, kind, priority, status, source, created_at, updated_at, ticket_type_id, service_id, team_id, sla_due_at, sla_status, location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTO', 'AGENT', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, number, asset.organization_id, handlingBranchId, originBranchId, asset.id, requester?.id || null,
          payload.title, payload.description, ticketType.category, ticketType.kind, ticketType.default_priority,
          now, now, ticketType.id, service?.id || null, team?.id || null, slaDueAt, slaStatus,
          payload.locationId || null,
        );

      const insertResponse = db.prepare(`INSERT INTO ticket_responses
        (id, ticket_id, field_id, field_label, field_type, value_text)
        VALUES (?, ?, ?, ?, ?, ?)`);
      for (const field of configuredFields) {
        if (["FILE", "SCREENSHOT"].includes(field.field_type)) {
          const attachment = (payload.attachments || []).find((item) => item.fieldId === field.id);
          if (attachment) insertResponse.run(makeId("rsp"), id, field.id, field.label, field.field_type, attachment.originalName || attachment.storedName);
          continue;
        }
        const value = answerMap.get(field.id);
        if (value) insertResponse.run(makeId("rsp"), id, field.id, field.label, field.field_type, value);
      }

      if (payload.attachments?.length) {
        const insertAttachment = db.prepare(`
          INSERT INTO attachments (id, ticket_id, field_id, original_name, stored_name, mime_type, size_bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const file of payload.attachments) {
          insertAttachment.run(makeId("att"), id, file.fieldId || null, file.originalName, file.storedName, file.mimeType || null, file.sizeBytes || 0, now);
        }
      }

      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
        .run(makeId("evt"), id, requester?.id || null, requester?.name || authorName, "Chamado aberto pelo agente do usuário.", now);

      if (handlingBranchId !== originBranchId && handlingBranch?.name) {
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'ROUTED', ?, ?)")
          .run(makeId("evt"), id, requester?.id || null, requester?.name || authorName, `Chamado encaminhado para a fila de ${handlingBranch.name}.`, now);
      }

      if (ticketType.requires_term && payload.term) {
        const termId = makeId("term");
        const fileName = `${termId}.pdf`;
        db.prepare(`INSERT INTO equipment_terms
          (id, organization_id, branch_id, asset_id, user_id, ticket_id, term_template_id, signer_name, signer_document, signature_text, pdf_name, pdf_url, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSINADO', ?)`)
          .run(
            termId,
            asset.organization_id,
            handlingBranchId,
            asset.id,
            requester?.id || null,
            id,
            ticketType.term_template_id || null,
            payload.term.signerName || authorName,
            payload.term.signerDocument || null,
            payload.term.signatureText,
            fileName,
            `/api/terms/${termId}/pdf`,
            now,
          );
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'TERM_SIGNED', ?, ?)")
          .run(makeId("evt"), id, requester?.id || null, requester?.name || authorName, "Termo de equipamento assinado no chamado.", now);
      }
    })();

    if (team?.id) {
      const members = db.prepare("SELECT user_id FROM team_members WHERE team_id=?").all(team.id);
      members.forEach((member) => createNotification(db, {
        organizationId: asset.organization_id,
        userId: member.user_id,
        eventType: "TICKET_NEW",
        title: `Novo chamado #${number}`,
        body: payload.title,
        referenceId: id,
        referenceType: "TICKET",
      }));
    }

    runEscalationCheck(db, id, asset.organization_id);
    dispatchWebhooks(db, asset.organization_id, "TICKET_NEW", {
      id, number, title: payload.title, source: "AGENT", assetId: asset.id, hostname: asset.hostname,
      requesterId: requester?.id || null, ticketTypeId: ticketType.id,
    });

    return { id, number, status: 201 };
  }

  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const id = makeId("tkt");
  const now = new Date().toISOString();

  db.prepare(`INSERT INTO tickets
    (id, number, organization_id, branch_id, origin_branch_id, asset_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTO', 'AGENT', ?, ?, ?)`)
    .run(
      id, number, asset.organization_id, asset.branch_id, asset.branch_id, asset.id, requester?.id || null,
      payload.title, payload.description, payload.category || "Suporte", payload.kind || "INCIDENTE",
      payload.priority || "MEDIA", now, now, payload.locationId || null,
    );
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
    .run(makeId("evt"), id, requester?.id || null, requester?.name || authorName, "Chamado aberto pelo usuário via agente.", now);

  dispatchWebhooks(db, asset.organization_id, "TICKET_NEW", {
    id, number, title: payload.title, source: "AGENT", assetId: asset.id, hostname: asset.hostname,
    requesterId: requester?.id || null,
  });

  return { id, number, status: 201 };
}

export function listAgentTicketMessages(db, ticket) {
  const messages = db.prepare(`
    SELECT id, ticket_id, author_id, author_name AS sender_name, body, visibility, message_type, created_at
    FROM ticket_messages WHERE ticket_id=? AND visibility='PUBLIC' ORDER BY created_at
  `).all(ticket.id);

  const responses = db.prepare(`
    SELECT field_label, field_type, value_text
    FROM ticket_responses WHERE ticket_id=? ORDER BY rowid
  `).all(ticket.id);

  const authorName = ticket.source === "AGENT" || ticket.source === "MONITOR"
    ? (ticket.title?.includes(" em ") ? "Sistema" : "Você")
    : "Você";

  const opening = {
    id: `opening-${ticket.id}`,
    ticket_id: ticket.id,
    author_type: "USER",
    sender_name: authorName,
    body: ticket.description,
    visibility: "PUBLIC",
    message_type: "OPENING",
    created_at: ticket.created_at,
  };

  const questionMessages = responses
    .filter((row) => row.field_type !== "FILE" && row.field_type !== "SCREENSHOT")
    .map((row, index) => ({
      id: `response-${ticket.id}-${index}`,
      ticket_id: ticket.id,
      author_type: "USER",
      sender_name: "Informações do chamado",
      body: `${row.field_label}: ${row.value_text}`,
      visibility: "PUBLIC",
      message_type: "FORM_RESPONSE",
      created_at: ticket.created_at,
    }));

  const enrichedMessages = messages.map((msg) => ({
    ...msg,
    author_type: msg.author_id ? "TECHNICIAN" : "USER",
  }));

  return [opening, ...questionMessages, ...enrichedMessages];
}

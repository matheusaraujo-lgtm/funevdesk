import { escapeLdapFilterValue } from "@/lib/security";

function renderFilter(template, email) {
  // Escapa o e-mail (RFC 4515) antes de interpolar — evita injeção de filtro LDAP.
  return (template || "(mail={{email}})").replaceAll("{{email}}", escapeLdapFilterValue(email));
}

async function getLdapClient(url) {
  try {
    const { Client } = await import("ldapts");
    return new Client({ url, timeout: 8000, connectTimeout: 8000 });
  } catch {
    throw new Error("Pacote LDAP não instalado no servidor. Execute npm install ldapts.");
  }
}

export async function authenticateLdap(settings, email, password) {
  if (!settings?.ldap_enabled || settings.auth_mode !== "LDAP") {
    return { ok: false, error: "LDAP não está habilitado para esta unidade." };
  }
  if (!settings.ldap_url || !settings.ldap_base_dn) {
    return { ok: false, error: "LDAP incompleto: informe URL e base DN." };
  }

  const client = await getLdapClient(settings.ldap_url);
  try {
    if (settings.ldap_bind_dn && settings.ldap_bind_password) {
      await client.bind(settings.ldap_bind_dn, settings.ldap_bind_password);
    }

    const filter = renderFilter(settings.ldap_user_filter, email);
    const { searchEntries } = await client.search(settings.ldap_base_dn, {
      scope: "sub",
      filter,
      attributes: ["dn", "mail", "cn", "displayName", "sAMAccountName"],
      sizeLimit: 5,
    });

    // Sem fallback para searchEntries[0]: exige correspondência exata de e-mail,
    // impedindo que um filtro manipulado faça bind no primeiro registro retornado.
    const entry = searchEntries.find((item) => {
      const mail = String(item.mail || "").toLowerCase();
      return mail === email.toLowerCase();
    });

    if (!entry?.dn) return { ok: false, error: "Usuário não encontrado no diretório LDAP." };

    const userClient = await getLdapClient(settings.ldap_url);
    try {
      await userClient.bind(String(entry.dn), password);
      return {
        ok: true,
        profile: {
          dn: String(entry.dn),
          name: String(entry.displayName || entry.cn || email.split("@")[0]),
          email: String(entry.mail || email).toLowerCase(),
        },
      };
    } finally {
      await userClient.unbind().catch(() => {});
    }
  } catch (error) {
    return { ok: false, error: error.message || "Falha na autenticação LDAP." };
  } finally {
    await client.unbind().catch(() => {});
  }
}

export function getBranchAuthSettings(db, branchId) {
  return db.prepare(`
    SELECT branch_id, auth_mode, ldap_url, ldap_base_dn, ldap_bind_dn, ldap_bind_password,
      ldap_user_filter, ldap_enabled
    FROM branch_auth_settings WHERE branch_id=?
  `).get(branchId) || { branch_id: branchId, auth_mode: "LOCAL", ldap_enabled: 0 };
}

export function saveBranchAuthSettings(db, branchId, settings) {
  const authMode = settings.authMode === "LDAP" && settings.ldapEnabled ? "LDAP" : "LOCAL";
  db.prepare(`
    INSERT INTO branch_auth_settings
      (branch_id, auth_mode, ldap_url, ldap_base_dn, ldap_bind_dn, ldap_bind_password, ldap_user_filter, ldap_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(branch_id) DO UPDATE SET
      auth_mode=excluded.auth_mode,
      ldap_url=excluded.ldap_url,
      ldap_base_dn=excluded.ldap_base_dn,
      ldap_bind_dn=excluded.ldap_bind_dn,
      ldap_bind_password=CASE WHEN excluded.ldap_bind_password IS NOT NULL AND excluded.ldap_bind_password <> '' THEN excluded.ldap_bind_password ELSE branch_auth_settings.ldap_bind_password END,
      ldap_user_filter=excluded.ldap_user_filter,
      ldap_enabled=excluded.ldap_enabled
  `).run(
    branchId,
    authMode,
    settings.ldapUrl || null,
    settings.ldapBaseDn || null,
    settings.ldapBindDn || null,
    settings.ldapBindPassword || null,
    settings.ldapUserFilter || "(mail={{email}})",
    settings.ldapEnabled ? 1 : 0,
  );
}

import { Redis } from "@upstash/redis";
import { v4 as uuidv4 } from "uuid";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

// Proteção simples por token de admin (defina ADMIN_TOKEN nas env vars)
function isAuthorized(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "").trim();
  return token === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, erro: "não_autorizado" });
  }

  const { action } = req.query;

  // ── Criar chave manual ──────────────────────────────────────────────────
  if (req.method === "POST" && action === "create") {
    const { email, nome, observacao } = req.body || {};
    if (!email) {
      return res.status(400).json({ ok: false, erro: "email_obrigatório" });
    }

    const chave = uuidv4();
    await redis.set(
      `licenca:${chave}`,
      JSON.stringify({
        email,
        nome: nome || "Manual",
        observacao: observacao || "",
        transactionId: "MANUAL-" + Date.now(),
        status: "active",
        criadoEm: new Date().toISOString(),
        origem: "admin",
      })
    );

    return res.status(200).json({ ok: true, chave, email });
  }

  // ── Buscar licença por chave ────────────────────────────────────────────
  if (req.method === "GET" && action === "get") {
    const { key } = req.query;
    if (!key) return res.status(400).json({ ok: false, erro: "key_obrigatória" });

    const raw = await redis.get(`licenca:${key}`);
    if (!raw) return res.status(404).json({ ok: false, erro: "não_encontrada" });

    const licenca = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.status(200).json({ ok: true, chave: key, licenca });
  }

  // ── Listar todas as licenças ────────────────────────────────────────────
  if (req.method === "GET" && action === "list") {
    const keys = await redis.keys("licenca:*");
    const licencas = [];

    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      licencas.push({ chave: k.replace("licenca:", ""), ...data });
    }

    licencas.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    return res.status(200).json({ ok: true, total: licencas.length, licencas });
  }

  // ── Revogar licença ─────────────────────────────────────────────────────
  if (req.method === "POST" && action === "revoke") {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, erro: "key_obrigatória" });

    const raw = await redis.get(`licenca:${key}`);
    if (!raw) return res.status(404).json({ ok: false, erro: "não_encontrada" });

    const licenca = typeof raw === "string" ? JSON.parse(raw) : raw;
    licenca.status = "revoked";
    licenca.revokedEm = new Date().toISOString();
    licenca.motivoRevogacao = "admin_manual";

    await redis.set(`licenca:${key}`, JSON.stringify(licenca));
    return res.status(200).json({ ok: true, acao: "revogada", chave: key });
  }

  // ── Reativar licença ────────────────────────────────────────────────────
  if (req.method === "POST" && action === "reactivate") {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, erro: "key_obrigatória" });

    const raw = await redis.get(`licenca:${key}`);
    if (!raw) return res.status(404).json({ ok: false, erro: "não_encontrada" });

    const licenca = typeof raw === "string" ? JSON.parse(raw) : raw;
    licenca.status = "active";
    delete licenca.revokedEm;
    delete licenca.motivoRevogacao;
    licenca.reativadoEm = new Date().toISOString();

    await redis.set(`licenca:${key}`, JSON.stringify(licenca));
    return res.status(200).json({ ok: true, acao: "reativada", chave: key });
  }

  // ── Resetar dispositivo vinculado ───────────────────────────────────────
  if (req.method === "POST" && action === "reset-device") {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, erro: "key_obrigatória" });

    const raw = await redis.get(`licenca:${key}`);
    if (!raw) return res.status(404).json({ ok: false, erro: "não_encontrada" });

    const licenca = typeof raw === "string" ? JSON.parse(raw) : raw;
    delete licenca.fingerprint;
    delete licenca.ativadoEm;
    licenca.resetadoEm = new Date().toISOString();

    await redis.set(`licenca:${key}`, JSON.stringify(licenca));
    return res.status(200).json({ ok: true, acao: "dispositivo_resetado", chave: key });
  }

  // ── Deletar licença (permanente) ────────────────────────────────────────
  if (req.method === "DELETE" && action === "delete") {
    const { key } = req.query;
    if (!key) return res.status(400).json({ ok: false, erro: "key_obrigatória" });

    await redis.del(`licenca:${key}`);
    return res.status(200).json({ ok: true, acao: "deletada", chave: key });
  }

  return res.status(400).json({ ok: false, erro: "ação_inválida" });
}

const { Redis } = require("@upstash/redis");
const { v4: uuidv4 } = require("uuid");



const TEST_EMAIL = "lucasmascarello.eng@gmail.com";

// Detecta transações de teste da Hotmart:
// 1. TEST_MODE=true no Vercel — força modo teste manualmente
// 2. transactionId começa com "HP" — padrão real do painel de testes da Hotmart
// 3. transactionId começa com "TEST" — prefixo alternativo
// 4. E-mail @example.com — e-mails fictícios gerados pelo painel de testes
function isTestTransaction(transactionId = "", email = "") {
  if (process.env.TEST_MODE === "true") return true;
  const tid = transactionId.toUpperCase();
  if (tid.startsWith("HP") || tid.startsWith("TEST")) return true;
  if (email.toLowerCase().endsWith("@example.com")) return true;
  return false;
}

async function sendLicenseEmail(email, nome, chave, isTest = false) {
  const destinatario = isTest ? TEST_EMAIL : email;
  const subjectPrefix = isTest ? "[TESTE] " : "";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Mascarello Engenharia <onboarding@resend.dev>",
      to: destinatario,
      subject: `${subjectPrefix}Sua chave de acesso — Bacia de Contenção de Tanques V/H`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          ${isTest ? `<div style="background:#fffbe6;border:1px solid #f0c000;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:13px;color:#7a5f00">⚠️ <strong>Modo teste</strong> — e-mail original do comprador: <code>${email}</code></div>` : ""}
          <h2 style="color:#C41E1E">Checklist de Distanciamentos de Tanques</h2>
          <p>Olá, <strong>${nome}</strong>!</p>
          <p>Sua compra foi confirmada. Use a chave abaixo para acessar o sistema:</p>
          <div style="background:#f4f4f4;padding:16px;border-radius:8px;text-align:center;font-size:20px;letter-spacing:2px;font-weight:bold;color:#1A1A1A">
            ${chave}
          </div>
          <p style="margin-top:24px;color:#555">Acesse o sistema em: <a href="https://checklist-distanciamentos.vercel.app">checklist-distanciamentos.vercel.app</a></p>
          <p style="color:#555">Guarde esta chave. Ela é pessoal e intransferível.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="font-size:12px;color:#999">Mascarello Engenharia · CREA-SC 221902-8</p>
        </div>
      `,
    }),
  });
}

module.exports = async function handler(req, res) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  });
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { event, data } = req.body;

  if (!event || !data) {
    return res.status(400).json({ ok: false, erro: "Payload inválido" });
  }

  const email = data?.buyer?.email;
  const nome = data?.buyer?.name || "Cliente";
  const transactionId = data?.purchase?.transaction;

  if (!email || !transactionId) {
    return res.status(400).json({ ok: false, erro: "Dados do comprador ausentes" });
  }

  // Compra aprovada: gera e salva chave
  if (event === "PURCHASE_APPROVED" || event === "PURCHASE_COMPLETE") {
    // Evita duplicar licença se o webhook disparar duas vezes
    const chaveExistente = await redis.get(`transacao:${transactionId}`);
    if (chaveExistente) {
      console.log(`Licença já existe para transação ${transactionId}: ${chaveExistente}`);
      return res.status(200).json({ ok: true, acao: "licenca_ja_existia" });
    }

    const chave = uuidv4();
    await redis.set(`licenca:${chave}`, JSON.stringify({
      email,
      nome,
      transactionId,
      status: "active",
      criadoEm: new Date().toISOString(),
    }));
    // Índice reverso para busca por transação
    await redis.set(`transacao:${transactionId}`, chave);

    const isTest = isTestTransaction(transactionId, email);
    try {
      await sendLicenseEmail(email, nome, chave, isTest);
    } catch (emailErr) {
      console.error("Erro ao enviar e-mail:", emailErr.message);
      // Não falha o webhook por causa do e-mail
    }

    console.log(`Licença criada: ${chave} para ${email}`);
    return res.status(200).json({ ok: true, acao: "licenca_criada" });
  }

  // Reembolso ou chargeback: revoga chave
  if (
    event === "PURCHASE_REFUNDED" ||
    event === "PURCHASE_CHARGEBACK" ||
    event === "PURCHASE_CANCELED"
  ) {
    const chave = await redis.get(`transacao:${transactionId}`);
    if (chave) {
      const dadosBrutos = await redis.get(`licenca:${chave}`);
      if (dadosBrutos) {
        const parsed = typeof dadosBrutos === "string" ? JSON.parse(dadosBrutos) : dadosBrutos;
        parsed.status = "revoked";
        parsed.revokedEm = new Date().toISOString();
        parsed.motivoRevogacao = event;
        await redis.set(`licenca:${chave}`, JSON.stringify(parsed));
        console.log(`Licença revogada: ${chave} — motivo: ${event}`);
      }
    }
    return res.status(200).json({ ok: true, acao: "licenca_revogada" });
  }

  // Outros eventos: apenas confirma recebimento
  console.log(`Evento ignorado: ${event}`);
  return res.status(200).json({ ok: true, acao: "ignorado" });
}

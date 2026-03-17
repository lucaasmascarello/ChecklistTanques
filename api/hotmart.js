const { Redis } = require("@upstash/redis");
const { v4: uuidv4 } = require("uuid");

const TEST_EMAIL = "lucasmascarello.eng@gmail.com";

// Mapeia nome do produto Hotmart → identificador da ferramenta
// Mapa de IDs de produto Hotmart → ferramenta
const PRODUTO_ID_MAP = {
  "7403112": "checklist",   // Checklist de Distanciamento entre Tanques - NBR 17505
  "7370938": "calculadora", // Calculadora PPCI Industrial — NBR 17505 / NR-20
};

function identificarFerramenta(nomeProduto = "", productId = "") {
  // 1. Prioridade: ID do produto (mais confiável)
  if (productId && PRODUTO_ID_MAP[String(productId)]) {
    return PRODUTO_ID_MAP[String(productId)];
  }
  // 2. Fallback: nome do produto
  const nome = nomeProduto.toLowerCase();
  if (nome.includes("checklist") || nome.includes("distanciamento") || nome.includes("tanques")) {
    return "checklist";
  }
  if (nome.includes("calculadora") || nome.includes("ppci") || nome.includes("nr-20") || nome.includes("nr20")) {
    return "calculadora";
  }
  // 3. Produto de teste → checklist por padrão
  return "checklist";
}

function isTestTransaction(transactionId = "", email = "") {
  if (process.env.TEST_MODE === "true") return true;
  const tid = transactionId.toUpperCase();
  if (tid.startsWith("HP") || tid.startsWith("TEST")) return true;
  if (email.toLowerCase().endsWith("@example.com")) return true;
  return false;
}

const FERRAMENTAS_CONFIG = {
  checklist: {
    nome: "Checklist de Distanciamentos de Tanques",
    url: "https://checklist-tanques.vercel.app",
    cor: "#C41E1E",
  },
  calculadora: {
    nome: "Calculadora PPCI Industrial",
    url: "https://calculadora-ppci.vercel.app",
    cor: "#1A3C8F",
  },
};

async function sendLicenseEmail(email, nome, chave, ferramenta, isTest = false) {
  const destinatario = isTest ? TEST_EMAIL : email;
  const subjectPrefix = isTest ? "[TESTE] " : "";
  const config = FERRAMENTAS_CONFIG[ferramenta] || FERRAMENTAS_CONFIG["checklist"];

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Mascarello Engenharia <onboarding@resend.dev>",
      to: destinatario,
      subject: `${subjectPrefix}Sua chave de acesso — ${config.nome}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          ${isTest ? `<div style="background:#fffbe6;border:1px solid #f0c000;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:13px;color:#7a5f00">⚠️ <strong>Modo teste</strong> — e-mail original do comprador: <code>${email}</code> — ferramenta: <strong>${ferramenta}</strong></div>` : ""}
          <h2 style="color:${config.cor}">${config.nome}</h2>
          <p>Olá, <strong>${nome}</strong>!</p>
          <p>Sua compra foi confirmada. Use a chave abaixo para acessar o sistema:</p>
          <div style="background:#f4f4f4;padding:16px;border-radius:8px;text-align:center;font-size:20px;letter-spacing:2px;font-weight:bold;color:#1A1A1A">
            ${chave}
          </div>
          <p style="margin-top:24px;color:#555">Acesse o sistema em: <a href="${config.url}">${config.url}</a></p>
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
  const nomeProduto = data?.product?.name || "";
  const productId = data?.product?.id || "";
  const ferramenta = identificarFerramenta(nomeProduto, productId);

  if (!email || !transactionId) {
    return res.status(400).json({ ok: false, erro: "Dados do comprador ausentes" });
  }

  if (event === "PURCHASE_APPROVED" || event === "PURCHASE_COMPLETE") {
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
      ferramenta,
      status: "active",
      criadoEm: new Date().toISOString(),
    }));
    await redis.set(`transacao:${transactionId}`, chave);

    const isTest = isTestTransaction(transactionId, email);
    try {
      await sendLicenseEmail(email, nome, chave, ferramenta, isTest);
    } catch (emailErr) {
      console.error("Erro ao enviar e-mail:", emailErr.message);
    }

    console.log(`Licença criada: ${chave} para ${email} — ferramenta: ${ferramenta}`);
    return res.status(200).json({ ok: true, acao: "licenca_criada", ferramenta });
  }

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

  console.log(`Evento ignorado: ${event}`);
  return res.status(200).json({ ok: true, acao: "ignorado" });
}

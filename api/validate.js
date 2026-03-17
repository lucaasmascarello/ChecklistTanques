const { Redis } = require("@upstash/redis");

// Identificador desta ferramenta — mude para "calculadora" no projeto da calculadora
const FERRAMENTA_ATUAL = "checklist";

module.exports = async function handler(req, res) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  });

  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { licenseKey, fingerprint, ativar } = req.body;

  if (!licenseKey || !fingerprint) {
    return res.status(400).json({ valid: false, erro: "dados_incompletos" });
  }

  const dadosBrutos = await redis.get(`licenca:${licenseKey}`);
  if (!dadosBrutos) {
    return res.status(200).json({ valid: false, erro: "chave_invalida" });
  }

  const licenca = typeof dadosBrutos === "string"
    ? JSON.parse(dadosBrutos)
    : dadosBrutos;

  if (licenca.status !== "active") {
    return res.status(200).json({ valid: false, erro: "chave_revogada" });
  }

  // Verifica se a chave é para esta ferramenta
  // Licenças antigas sem campo ferramenta são aceitas para não quebrar acessos existentes
  if (licenca.ferramenta && licenca.ferramenta !== FERRAMENTA_ATUAL) {
    console.warn(`Acesso negado: chave ${licenseKey} é para "${licenca.ferramenta}", não "${FERRAMENTA_ATUAL}"`);
    return res.status(200).json({ valid: false, erro: "chave_outra_ferramenta" });
  }

  // Caso 1: licença ainda não ativada em nenhum dispositivo
  if (!licenca.fingerprint) {
    if (ativar) {
      licenca.fingerprint = fingerprint;
      licenca.ativadoEm = new Date().toISOString();
      await redis.set(`licenca:${licenseKey}`, JSON.stringify(licenca));
      console.log(`Licença ativada: ${licenseKey} — fingerprint: ${fingerprint}`);
    }
    return res.status(200).json({ valid: true });
  }

  // Caso 2: mesmo dispositivo
  if (licenca.fingerprint === fingerprint) {
    return res.status(200).json({ valid: true });
  }

  // Caso 3: dispositivo diferente
  console.warn(`Tentativa bloqueada: ${licenseKey} — fingerprint esperado: ${licenca.fingerprint}, recebido: ${fingerprint}`);
  return res.status(200).json({ valid: false, erro: "dispositivo_diferente" });
}

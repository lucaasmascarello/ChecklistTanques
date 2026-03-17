const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { licenseKey, fingerprint, ativar } = req.body;

  if (!licenseKey || !fingerprint) {
    return res.status(400).json({ valid: false, erro: "dados_incompletos" });
  }

  // Busca licença no Redis
  const dadosBrutos = await redis.get(`licenca:${licenseKey}`);
  if (!dadosBrutos) {
    return res.status(200).json({ valid: false, erro: "chave_invalida" });
  }

  const licenca = typeof dadosBrutos === "string"
    ? JSON.parse(dadosBrutos)
    : dadosBrutos;

  // Chave revogada
  if (licenca.status !== "active") {
    return res.status(200).json({ valid: false, erro: "chave_revogada" });
  }

  // --- Lógica de ativação por dispositivo ---

  // Caso 1: licença ainda não foi ativada em nenhum dispositivo
  if (!licenca.fingerprint) {
    if (ativar) {
      // Primeira ativação: grava o fingerprint
      licenca.fingerprint = fingerprint;
      licenca.ativadoEm = new Date().toISOString();
      await redis.set(`licenca:${licenseKey}`, JSON.stringify(licenca));
      console.log(`Licença ativada: ${licenseKey} — fingerprint: ${fingerprint}`);
    }
    return res.status(200).json({ valid: true });
  }

  // Caso 2: licença já ativada — confere se é o mesmo dispositivo
  if (licenca.fingerprint === fingerprint) {
    return res.status(200).json({ valid: true });
  }

  // Caso 3: dispositivo diferente — nega acesso
  console.warn(`Tentativa bloqueada: ${licenseKey} — fingerprint esperado: ${licenca.fingerprint}, recebido: ${fingerprint}`);
  return res.status(200).json({ valid: false, erro: "dispositivo_diferente" });
}

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { licenseKey, fingerprint } = req.body;

  if (!licenseKey || !fingerprint) {
    return res.status(400).json({ ok: false, erro: "dados_incompletos" });
  }

  // Busca licença
  const dadosBrutos = await redis.get(`licenca:${licenseKey}`);
  if (!dadosBrutos) {
    return res.status(200).json({ ok: false, erro: "chave_invalida" });
  }

  const licenca = typeof dadosBrutos === "string"
    ? JSON.parse(dadosBrutos)
    : dadosBrutos;

  if (licenca.status !== "active") {
    return res.status(200).json({ ok: false, erro: "chave_revogada" });
  }

  // Só permite liberar se o fingerprint bate com o dispositivo atual
  // (evita que alguém libere remotamente a licença de outra pessoa)
  if (licenca.fingerprint && licenca.fingerprint !== fingerprint) {
    console.warn(`Release negado: ${licenseKey} — fingerprint não confere`);
    return res.status(200).json({ ok: false, erro: "dispositivo_diferente" });
  }

  // Remove o fingerprint — licença volta a estar disponível para ativação
  delete licenca.fingerprint;
  delete licenca.ativadoEm;
  licenca.liberadoEm = new Date().toISOString();

  await redis.set(`licenca:${licenseKey}`, JSON.stringify(licenca));
  console.log(`Licença liberada: ${licenseKey}`);

  return res.status(200).json({ ok: true });
}

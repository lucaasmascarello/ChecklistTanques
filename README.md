# 📐 Checklist de Distanciamentos entre Tanques

Ferramenta técnica para verificação normativa do espaçamento entre costados de tanques conforme **ABNT NBR 17505-2:2024** (Tabela 2), **IT 25/2025 – SP** e **NTCB 24/2020 – CBMMT/MT**, com geração de memorial de cálculo em A4 e proteção por chave de licença por dispositivo.

Desenvolvido por **Lucas Mascarello** · CREA-SC 221902-8

---

## ✨ Funcionalidades

- Seleção de norma de referência: NBR 17505-2, IT 25/2025 (SP), NTCB 24/2020 (MT) ou outra
- Verificação para tanques de teto flutuante/selo e teto fixo/horizontal (Classes I, II, IIIA)
- Cálculo automático de todos os pares de tanques do parque
- Fórmulas distintas por faixa de diâmetro (≤45 m e >45 m)
- Checklist visual: ✔ Conforme / ✘ Não conforme por par
- Distâncias limite, vias e edificações (aba dedicada)
- Base de dados de líquidos inflamáveis/combustíveis (editável)
- Memorial de cálculo formatado para impressão em A4
- Persistência local (salvar HTML com estado embutido)
- **Proteção por chave de licença vinculada ao dispositivo**

---

## 🗂 Estrutura

```
├── index.html          # Ferramenta completa (front-end + tela de licença)
├── api/
│   ├── validate.js     # Valida licença e vincula fingerprint de dispositivo
│   ├── release.js      # Libera licença para uso em outro dispositivo
│   ├── hotmart.js      # Webhook Hotmart: gera/revoga licenças por pagamento
│   └── admin.js        # API administrativa (criar, listar, revogar chaves)
├── vercel.json         # Roteamento Vercel
├── package.json
├── .env.example        # Modelo de variáveis de ambiente
└── .gitignore
```

---

## 🚀 Deploy no Vercel

### 1. Serviços necessários

| Serviço | Para quê | Custo |
|---|---|---|
| [Vercel](https://vercel.com) | Hospedagem + Serverless | Grátis |
| [Upstash Redis](https://console.upstash.com) | Banco de licenças | Grátis até 10k req/dia |
| [Resend](https://resend.com) | Envio de e-mails | Grátis até 3k/mês |

### 2. Comandos

```bash
git clone https://github.com/SEU_USUARIO/checklist-distanciamentos-tanques.git
cd checklist-distanciamentos-tanques
npm install
vercel login
vercel --prod
```

### 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obter em |
|---|---|
| `UPSTASH_REDIS_REST_KV_REST_API_URL` | Painel Upstash → REST API URL |
| `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` | Painel Upstash → REST API Token |
| `RESEND_API_KEY` | resend.com → API Keys |
| `ADMIN_TOKEN` | Qualquer string secreta (sua senha de admin) |
| `APP_URL` | URL do seu deploy (ex.: `https://checklist-distanciamentos.vercel.app`) |
| `EMAIL_FROM` | Ex.: `Mascarello Engenharia <noreply@seudominio.com>` |
| `DEV_EMAIL` | E-mail que recebe cópias em modo teste |
| `TEST_MODE` | `false` (produção) · `true` (redireciona e-mails para DEV_EMAIL) |

---

## 🔑 Sistema de Licenças

### Fluxo

```
Compra na Hotmart → POST /api/hotmart
  → Gera UUID (chave) → Redis → E-mail para o comprador
  → Usuário acessa a URL, digita a chave
  → POST /api/validate (valida + vincula ao dispositivo via fingerprint)
  → Ferramenta liberada
```

### Fingerprint de dispositivo

Gerado a partir de: resolução de tela, profundidade de cor, fuso horário, nº de CPUs lógicas e idioma do sistema. Estável entre navegadores, sem cookies.

O usuário pode liberar a licença clicando em **🔓 Liberar licença** no cabeçalho.

---

## 📡 API Reference

### `POST /api/validate`
```json
{ "licenseKey": "uuid", "fingerprint": "a1b2c3d4", "ativar": true }
// OK: { "valid": true }
// Erro: { "valid": false, "erro": "chave_invalida|chave_revogada|dispositivo_diferente" }
```

### `POST /api/release`
```json
{ "licenseKey": "uuid", "fingerprint": "a1b2c3d4" }
// Response: { "ok": true }
```

### `POST /api/hotmart`
Configure no painel Hotmart: `https://SEU-DOMINIO.vercel.app/api/hotmart`
Eventos: `PURCHASE_APPROVED` → cria licença · `PURCHASE_REFUNDED/CHARGEBACK/CANCELED` → revoga

### `GET|POST|DELETE /api/admin` · Header: `Authorization: Bearer ADMIN_TOKEN`

| Método | `?action=` | Body | Descrição |
|---|---|---|---|
| GET | `list` | — | Lista todas as licenças |
| GET | `get&key=UUID` | — | Busca uma licença |
| POST | `create` | `{email, nome}` | Cria chave manual |
| POST | `revoke` | `{key}` | Revoga licença |
| POST | `reactivate` | `{key}` | Reativa licença |
| POST | `reset-device` | `{key}` | Remove fingerprint vinculado |
| DELETE | `delete&key=UUID` | — | Deleta permanentemente |

---

## 📄 Licença

Código proprietário — todos os direitos reservados.  
© Lucas Mascarello · [lucasmascarello.eng@gmail.com](mailto:lucasmascarello.eng@gmail.com)

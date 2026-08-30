import { isPublicHttpsUrl, safeFetch } from "./safeFetch";
import { invokeLLM } from "./llm";

export type ExtractedClaim = {
  claimText: string;
  confidence: number;
  notes: string;
};

const CLAIM_EXTRACTION_SCHEMA = {
  name: "claim_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      claimText: { type: "string" },
      confidence: { type: "number" },
      notes: { type: "string" },
    },
    required: ["claimText", "confidence", "notes"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT =
  "Você ajuda uma redação de checagem de fatos a transformar material bruto (link ou print de rede social) em uma alegação verificável, objetiva, em uma única frase declarativa. Nunca avalie se a alegação é verdadeira ou falsa e nunca decida um veredito. Não invente informação que não esteja no material fornecido. Se o material não contiver uma alegação clara e checável, diga isso no campo notes e use confiança baixa.";

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClaimResponse(raw: string): ExtractedClaim {
  let parsed: Partial<ExtractedClaim>;
  try {
    parsed = JSON.parse(raw) as Partial<ExtractedClaim>;
  } catch {
    throw new Error("O modelo retornou um formato que precisa de revisão técnica.");
  }
  if (typeof parsed.claimText !== "string" || !parsed.claimText.trim()) {
    throw new Error("Não foi possível identificar uma alegação neste material.");
  }
  return {
    claimText: parsed.claimText.trim(),
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

export async function extractClaimFromUrl(url: string): Promise<ExtractedClaim> {
  if (!isPublicHttpsUrl(url)) {
    throw new Error("Apenas links HTTPS públicos podem ser usados como origem da alegação.");
  }
  // safeFetch revalida cada redirect: um host público pode apontar para a rede interna.
  const response = await safeFetch(url, {
    timeoutMs: 10000,
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`Não foi possível acessar este link agora (HTTP ${response.status}).`);
  const text = stripHtml(await response.text()).slice(0, 8000);
  if (!text) throw new Error("Não foi possível extrair texto legível deste link.");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Conteúdo da página (${url}):\n\n${text}\n\nExtraia a alegação verificável central deste conteúdo.` },
    ],
    response_format: { type: "json_schema", json_schema: CLAIM_EXTRACTION_SCHEMA },
  });
  return parseClaimResponse(result.choices[0].message.content);
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function extractClaimFromImage(imageDataUrl: string): Promise<ExtractedClaim> {
  const match = /^data:image\/(?:png|jpe?g|gif|webp);base64,([\s\S]+)$/i.exec(imageDataUrl);
  if (!match) throw new Error("Envie um print em formato PNG, JPEG, GIF ou WEBP.");
  const approxBytes = (match[1].length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) throw new Error("O print é grande demais (limite de 6MB).");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Leia este print (pode ser um post, comentário ou mensagem) e extraia a alegação verificável central." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: CLAIM_EXTRACTION_SCHEMA },
  });
  return parseClaimResponse(result.choices[0].message.content);
}

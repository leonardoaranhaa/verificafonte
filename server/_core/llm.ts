import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] => (Array.isArray(value) ? value : [value]);

function assertApiKey() {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  assertApiKey();
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: ENV.anthropicApiKey });
  }
  return cachedClient;
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/.exec(url);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function toAnthropicBlock(part: TextContent | ImageContent | FileContent): Anthropic.ContentBlockParam {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  if (part.type === "image_url") {
    const parsed = parseDataUrl(part.image_url.url);
    if (parsed && SUPPORTED_IMAGE_TYPES.has(parsed.mediaType)) {
      return {
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: parsed.data },
      };
    }
    return { type: "image", source: { type: "url", url: part.image_url.url } };
  }

  // file_url (e.g. PDFs)
  const parsedFile = parseDataUrl(part.file_url.url);
  if (parsedFile) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: parsedFile.data } };
  }
  return { type: "document", source: { type: "url", url: part.file_url.url } };
}

function normalizeMessages(messages: Message[]): { system?: string; messages: Anthropic.MessageParam[] } {
  const systemParts: string[] = [];
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    const parts = ensureArray(message.content);

    if (message.role === "system") {
      systemParts.push(parts.map(part => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("\n"));
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      const text = parts.map(part => (typeof part === "string" ? part : JSON.stringify(part))).join("\n");
      anthropicMessages.push({ role: "user", content: text });
      continue;
    }

    const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
    const isTextOnly = parts.every(part => typeof part === "string");

    anthropicMessages.push({
      role,
      content: isTextOnly ? parts.join("") : parts.map(part => (typeof part === "string" ? { type: "text", text: part } : toAnthropicBlock(part))),
    });
  }

  return { system: systemParts.length ? systemParts.join("\n") : undefined, messages: anthropicMessages };
}

const STRUCTURED_OUTPUT_TOOL = "emit_structured_output";

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const anthropic = getClient();
  const { messages, model, maxTokens, max_tokens, responseFormat, response_format, outputSchema, output_schema } = params;
  const { system, messages: anthropicMessages } = normalizeMessages(messages);

  const format = responseFormat || response_format;
  const schema = format?.type === "json_schema" ? format.json_schema : outputSchema || output_schema;

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: model || ENV.anthropicModel,
    max_tokens: max_tokens ?? maxTokens ?? 4096,
    messages: anthropicMessages,
    ...(system ? { system } : {}),
  };

  if (schema) {
    const tool: Anthropic.Tool = {
      name: STRUCTURED_OUTPUT_TOOL,
      description: "Emit the structured result for this request.",
      input_schema: { type: "object", properties: schema.schema.properties, required: schema.schema.required as string[] | undefined },
    };
    request.tools = [tool];
    request.tool_choice = { type: "tool", name: STRUCTURED_OUTPUT_TOOL };
  }

  const response = await anthropic.messages.create(request);

  let content: string;
  if (schema) {
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    content = toolUse ? JSON.stringify(toolUse.input) : "";
  } else {
    content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("");
  }

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: response.stop_reason,
      },
    ],
    usage: response.usage
      ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        }
      : undefined,
  };
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();
  return {
    object: "list",
    data: [{ id: ENV.anthropicModel, object: "model", created: 0, owned_by: "anthropic" }],
  };
}

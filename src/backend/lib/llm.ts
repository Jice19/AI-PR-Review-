import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return _client;
}

interface LLMCallOptions {
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  temperature?: number;
  thinking?: boolean;
  maxTokens?: number;
}

/**
 * 调用 DeepSeek API，返回解析后的 JSON
 */
export async function callLLM<T>(
  messages: { role: "system" | "user"; content: string }[],
  options: LLMCallOptions
): Promise<T> {
  const { model, temperature = 0.1, thinking = false, maxTokens = 4096 } = options;

  const response = await getClient().chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    // DeepSeek V4 思考模式通过 extra_body 开启
    ...(thinking ? { extra_body: { thinking: { type: "enabled" } } as Record<string, unknown> } : {}),
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("LLM returned empty response");
  }

  // 尝试解析 JSON（去掉可能的 markdown 代码块包裹）
  const jsonStr = content
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // 如果解析失败，返回原始文本包装
    return { raw: content } as unknown as T;
  }
}

/**
 * 快速通道：Flash 非思考模式
 */
export async function callFlash<T>(
  messages: { role: "system" | "user"; content: string }[],
  maxTokens?: number
): Promise<T> {
  return callLLM<T>(messages, { model: "deepseek-v4-flash", maxTokens });
}

/**
 * 深度通道：Pro 思考模式
 */
export async function callPro<T>(
  messages: { role: "system" | "user"; content: string }[]
): Promise<T> {
  return callLLM<T>(messages, {
    model: "deepseek-v4-pro",
    thinking: true,
    maxTokens: 8192,
  });
}

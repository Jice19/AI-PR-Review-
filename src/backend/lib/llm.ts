import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
      // ⚠️ 不设 timeout 和 maxRetries —— SDK 的 timeout 对 DeepSeek 不生效
      // 改用 AbortController 实现可靠超时
    });
  }
  return _client;
}

const LLM_TIMEOUT_MS = 90_000; // 90s 硬超时

interface LLMCallOptions {
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  temperature?: number;
  thinking?: boolean;
  maxTokens?: number;
}







/**
 * 解析 LLM 返回的 JSON 内容（去除 markdown 代码块包裹）
 */
export function parseLLMResponse<T>(rawContent: string): T {
  const trimmed = rawContent.trim();

  // 1. 直接解析（最常见：纯 JSON 或 JSON 内含 markdown 代码块）
  try {
    const parsed = JSON.parse(trimmed) as T;
    logParseResult(parsed);
    return parsed;
  } catch { /* 有前言/后记/markdown包裹，继续尝试 */ }

  // 2. 找到最外层 { 和 }，提取 JSON
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = trimmed.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr) as T;
      logParseResult(parsed);
      return parsed;
    } catch { /* 提取的部分无效 JSON */ }
  }

  console.error(`[LLM] JSON 解析失败! 原始内容 (前500字符):`, trimmed.slice(0, 500));
  return { raw: rawContent } as unknown as T;
}

function logParseResult<T>(parsed: T) {
  if (parsed && typeof parsed === "object" && "issues" in parsed) {
    const arr = (parsed as Record<string, unknown>).issues;
    console.log(`[LLM] JSON 解析成功, issues: ${Array.isArray(arr) ? arr.length : "N/A"}`);
  }
}

/**
 * 调用 DeepSeek API，返回解析后的 JSON
 */
export async function callLLM<T>(
  messages: { role: "system" | "user"; content: string }[],
  options: LLMCallOptions
): Promise<T> {
  const { model, temperature = 0.1, thinking = false, maxTokens = 8192 } = options;

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  console.log(`[LLM] ${model} 调用, prompt: ${totalChars} chars, max_tokens: ${maxTokens}`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.error(`[LLM] ${model} 超时 (${LLM_TIMEOUT_MS / 1000}s)，中止请求`);
    controller.abort();
  }, LLM_TIMEOUT_MS);

  try {
    const response = await getClient().chat.completions.create(
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(thinking
          ? { extra_body: { thinking: { type: "enabled" } } as Record<string, unknown> }
          : {}),
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);

    const message = response.choices[0]?.message;
    const finishReason = response.choices[0]?.finish_reason;
    const content = message?.content;

    console.log(
      `[LLM] ${model} 完成 (finish: ${finishReason}, tokens: ${response.usage?.total_tokens})`
    );

    if (!content) {
      const msgRecord = message as unknown as Record<string, unknown> | undefined;
      const reasoningLen = msgRecord?.["reasoning_content"]
        ? String(msgRecord["reasoning_content"]).length
        : 0;
      throw new Error(
        `LLM returned empty response (finish_reason: ${finishReason}, reasoning_len: ${reasoningLen}). ` +
          `请增大 max_tokens。`
      );
    }

    return parseLLMResponse<T>(content);
  } catch (error: unknown) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM 调用超时 (${LLM_TIMEOUT_MS / 1000}s): ${model}`);
    }
    throw error;
  }
}

/**
 * 流式调用 DeepSeek API，逐 token 回调，返回解析后的 JSON
 */
export async function callLLMStream<T>(
  messages: { role: "system" | "user"; content: string }[],
  options: LLMCallOptions,
  onToken: (delta: string) => void
): Promise<T> {
  const { model, temperature = 0.1, thinking = false, maxTokens = 8192 } = options;

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  console.log(`[LLM] ${model} 流式调用, prompt: ${totalChars} chars, max_tokens: ${maxTokens}`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.error(`[LLM] ${model} 超时 (${LLM_TIMEOUT_MS / 1000}s)，中止请求`);
    controller.abort();
  }, LLM_TIMEOUT_MS);

  try {
    const stream = await getClient().chat.completions.create(
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...(thinking
          ? { extra_body: { thinking: { type: "enabled" } } as Record<string, unknown> }
          : {}),
      },
      { signal: controller.signal }
    );

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullContent += delta;
        onToken(delta);
      }
    }

    clearTimeout(timer);
    console.log(`[LLM] ${model} 流式完成, 总长度: ${fullContent.length} chars`);

    if (!fullContent) {
      throw new Error("LLM stream returned empty response. 请增大 max_tokens。");
    }

    return parseLLMResponse<T>(fullContent);
  } catch (error: unknown) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM 调用超时 (${LLM_TIMEOUT_MS / 1000}s): ${model}`);
    }
    throw error;
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
    maxTokens: 16384, // 足够空间给 reasoning + 输出
  });
}

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
 * 调用 DeepSeek API，返回解析后的 JSON
 */
export async function callLLM<T>(
  messages: { role: "system" | "user"; content: string }[],
  options: LLMCallOptions
): Promise<T> {
  const { model, temperature = 0.1, thinking = false, maxTokens = 8192 } = options;

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  console.log(`[LLM] ${model} 调用, prompt: ${totalChars} chars, max_tokens: ${maxTokens}`);

  // 用 AbortController 实现可靠超时（SDK 的 timeout 参数对 DeepSeek 不一定生效）
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

    // 尝试解析 JSON（去掉可能的 markdown 代码块包裹）
    const jsonStr = content
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    try {
      const parsed = JSON.parse(jsonStr) as T;
      // 打印解析结果摘要
      if (parsed && typeof parsed === "object" && "issues" in parsed) {
        const arr = (parsed as Record<string, unknown>).issues;
        console.log(`[LLM] JSON 解析成功, issues: ${Array.isArray(arr) ? arr.length : "N/A"}`);
      }
      return parsed;
    } catch (e) {
      // 打印原始内容用于排查
      console.error(`[LLM] JSON 解析失败! 原始内容 (前500字符):`, content.slice(0, 500));
      console.error(`[LLM] JSON 解析失败! 处理后 (前500字符):`, jsonStr.slice(0, 500));
      return { raw: content } as unknown as T;
    }
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

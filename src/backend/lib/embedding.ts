const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com";

const EMBEDDING_MODEL =
  process.env.BAILIAN_EMBEDDING_MODEL || "tongyi-embedding-vision-plus";

export interface EmbeddingResult {
  embedding: number[];
  chars: number;
  model: string;
}

interface DashScopeEmbeddingItem {
  index: number;
  embedding: number[];
}

interface DashScopeEmbeddingResponse {
  output?: {
    embeddings?: DashScopeEmbeddingItem[];
  };
  code?: string;
  message?: string;
}

async function callDashScopeEmbedding(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.BAILIAN_API_KEY;
  if (!apiKey) {
    throw new Error("BAILIAN_API_KEY 未设置，无法调用 embedding 服务");
  }

  const body: Record<string, unknown> = {
    model: EMBEDDING_MODEL,
    input: {
      contents: texts.map((text) => ({ text })),
    },
    parameters: {
      dimension: 1024,
    },
  };

  const response = await fetch(
    `${DASHSCOPE_BASE}/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `DashScope embedding 请求失败: ${response.status} ${response.statusText} - ${body}`
    );
  }

  const data: DashScopeEmbeddingResponse = await response.json();

  if (data.code) {
    throw new Error(
      `DashScope embedding 错误: ${data.code} - ${data.message}`
    );
  }

  const embeddings = data.output?.embeddings;
  if (!embeddings || embeddings.length === 0) {
    throw new Error("DashScope embedding 返回为空");
  }

  // 按 index 排序确保顺序
  embeddings.sort((a, b) => a.index - b.index);
  return embeddings.map((e) => e.embedding);
}

/**
 * 将单段文本转为向量
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const startTime = Date.now();

  const embeddings = await callDashScopeEmbedding([text]);
  const embedding = embeddings[0];

  console.log(
    `[Embedding] ${EMBEDDING_MODEL} 完成, chars=${text.length}, dim=${embedding.length}, time=${Date.now() - startTime}ms`
  );

  return {
    embedding,
    chars: text.length,
    model: EMBEDDING_MODEL,
  };
}

/**
 * 批量嵌入（最多 16 段文本一次）
 */
export async function embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];
  if (texts.length > 16) {
    const results: EmbeddingResult[] = [];
    for (let i = 0; i < texts.length; i += 16) {
      results.push(...(await embedBatch(texts.slice(i, i + 16))));
    }
    return results;
  }

  const startTime = Date.now();

  const embeddings = await callDashScopeEmbedding(texts);

  const results = embeddings.map((embedding, idx) => ({
    embedding,
    chars: texts[idx].length,
    model: EMBEDDING_MODEL,
  }));

  console.log(
    `[Embedding] batch ${texts.length} texts, time=${Date.now() - startTime}ms`
  );

  return results;
}

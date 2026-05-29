import { prisma } from "@/backend/lib/prisma";
import { embedText } from "@/backend/lib/embedding";

// ========== 类型 ==========

export interface FeedbackExample {
  feedback: string;       // USEFUL | FALSE_POSITIVE
  layer: string;
  codeSnippet: string;
  issueTitle: string;
  issueDescription: string;
  similarity: number;     // 余弦相似度 (0-1)
}

// ========== 向量写入 ==========

/**
 * 异步将 Issue 反馈写入向量库（fire-and-forget）
 * 从 issueId 获取 feedback + codeSnippet → embedding → upsert FeedbackVector
 */
export async function learnFromFeedback(
  issueIdOrOptions: string | { issueId: string }
): Promise<void> {
  const issueId =
    typeof issueIdOrOptions === "string" ? issueIdOrOptions : issueIdOrOptions.issueId;

  try {
    // 1. 获取 feedback + issue 信息
    const feedback = await prisma.issueFeedback.findUnique({
      where: { issueId },
      select: {
        feedback: true,
        issue: {
          select: {
            codeSnippet: true,
            layer: true,
            title: true,
            description: true,
          },
        },
      },
    });

    if (!feedback) {
      console.log(`[FeedbackLearner] issueId=${issueId} 无反馈记录，跳过向量化`);
      return;
    }

    // 只对 USEFUL / FALSE_POSITIVE 学习，NEEDS_REVIEW 特殊处理（也学习，标记为 USEFUL）
    const feedbackType = feedback.feedback === "NEEDS_REVIEW"
      ? "USEFUL"
      : feedback.feedback;

    const codeSnippet = feedback.issue.codeSnippet;
    if (!codeSnippet || codeSnippet.trim().length < 10) {
      console.log(`[FeedbackLearner] issueId=${issueId} codeSnippet 太短，跳过向量化`);
      return;
    }

    // 2. 调用 embedding
    const { embedding } = await embedText(codeSnippet);

    // 3. Upsert FeedbackVector（raw SQL 因为 Prisma 不支持 vector 类型）
    // 使用 issueId 作为唯一键（1:1 映射），id 用 gen_random_uuid()
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "FeedbackVector" ("id", "issueId", "feedback", "layer", "codeSnippet", "embedding", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, NOW())
       ON CONFLICT ("issueId") DO UPDATE SET
         "feedback" = EXCLUDED."feedback",
         "layer" = EXCLUDED."layer",
         "codeSnippet" = EXCLUDED."codeSnippet",
         "embedding" = EXCLUDED."embedding"`,
      issueId,
      feedbackType,
      feedback.issue.layer,
      codeSnippet,
      vectorStr
    );

    console.log(
      `[FeedbackLearner] 向量已写入: issueId=${issueId}, feedback=${feedbackType}, layer=${feedback.issue.layer}, snippet=${codeSnippet.length}chars`
    );
  } catch (error) {
    // Fire-and-forget: 静默处理，不抛异常
    console.error(
      `[FeedbackLearner] 向量写入失败 issueId=${issueId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

// ========== 语义检索 ==========

/**
 * 根据代码片段检索相似的历史反馈案例
 * @param queryText 查询文本（diff 或 codeSnippet）
 * @param layer 层级过滤（同类型代码匹配更精准）
 * @param limit 每类反馈最多返回数
 * @returns top-USEFUL + top-FALSE_POSITIVE 案例
 */
export async function retrieveFeedbackExamples(
  queryText: string,
  layer: string,
  limit = 3
): Promise<FeedbackExample[]> {
  if (!queryText || queryText.trim().length < 10) return [];

  try {
    // 1. 检查向量库是否有数据
    const count = await prisma.feedbackVector.count();
    if (count === 0) {
      console.log(`[FeedbackLearner] 向量库为空，跳过 RAG 检索`);
      return [];
    }

    // 2. Embed query
    const { embedding } = await embedText(queryText);
    const vectorStr = `[${embedding.join(",")}]`;

    // 3. 检索：USEFUL 和 FALSE_POSITIVE 各 top-N
    const results = await Promise.all([
      retrieveByType(queryText, vectorStr, layer, "USEFUL", limit),
      retrieveByType(queryText, vectorStr, layer, "FALSE_POSITIVE", limit),
    ]);

    const allExamples = [...results[0], ...results[1]];

    // 4. 按相似度排序
    allExamples.sort((a, b) => b.similarity - a.similarity);

    console.log(
      `[FeedbackLearner] 检索完成: ${allExamples.length} 条命中 (USEFUL:${results[0].length}, FP:${results[1].length}), query=${queryText.length}chars, layer=${layer}`
    );

    return allExamples;
  } catch (error) {
    // 检索失败不阻塞分析流程
    console.error(
      `[FeedbackLearner] 检索失败:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * 按 feedback 类型检索 top-N
 */
async function retrieveByType(
  _queryText: string,
  vectorStr: string,
  layer: string,
  feedbackType: string,
  limit: number
): Promise<FeedbackExample[]> {
  const similarityThreshold = 0.7;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      issueId: string;
      feedback: string;
      layer: string;
      codeSnippet: string;
      similarity: number;
    }>
  >(
    `SELECT
       fv."id",
       fv."issueId",
       fv."feedback",
       fv."layer",
       fv."codeSnippet",
       1 - (fv.embedding <=> $1::vector) AS similarity
     FROM "FeedbackVector" fv
     WHERE fv."feedback" = $2
       AND fv."layer" = $3
       AND 1 - (fv.embedding <=> $1::vector) >= $4
     ORDER BY fv.embedding <=> $1::vector
     LIMIT $5`,
    vectorStr,
    feedbackType,
    layer,
    similarityThreshold,
    limit
  );

  return rows.map((row) => ({
    feedback: row.feedback,
    layer: row.layer,
    codeSnippet: row.codeSnippet,
    issueTitle: "",
    issueDescription: "",
    similarity: Number(row.similarity),
  }));
}

// ========== Prompt 格式化 ==========

/**
 * 将检索到的反馈案例格式化为 prompt 片段
 */
export function formatFeedbackPrompt(examples: FeedbackExample[]): string {
  if (examples.length === 0) return "";

  const useful = examples.filter((e) => e.feedback === "USEFUL");
  const falsePositive = examples.filter((e) => e.feedback === "FALSE_POSITIVE");

  const parts: string[] = [];

  if (useful.length > 0) {
    parts.push("### 历史正确识别案例（USEFUL）");
    parts.push("以下是你过去正确发现的类似问题，请参考识别模式：\n");
    for (const ex of useful) {
      parts.push(`**相似度**: ${(ex.similarity * 100).toFixed(0)}%`);
      parts.push(`\`\`\``);
      parts.push(ex.codeSnippet.slice(0, 2000));
      parts.push(`\`\`\`\n`);
    }
  }

  if (falsePositive.length > 0) {
    parts.push("### 历史误报案例（FALSE_POSITIVE）");
    parts.push("以下是你过去误报过的案例，请避免对类似代码做出同样的错误判断：\n");
    for (const ex of falsePositive) {
      parts.push(`**相似度**: ${(ex.similarity * 100).toFixed(0)}%`);
      parts.push(`\`\`\``);
      parts.push(ex.codeSnippet.slice(0, 2000));
      parts.push(`\`\`\`\n`);
    }
  }

  return parts.join("\n");
}

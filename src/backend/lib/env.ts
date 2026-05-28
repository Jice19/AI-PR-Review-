import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().optional(),  // 用于提升 API 速率限制
});

export const env = envSchema.parse(process.env);

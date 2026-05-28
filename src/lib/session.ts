import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * 获取当前服务端 Session，用于 API Route 鉴权
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * 要求登录，否则抛出 401
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

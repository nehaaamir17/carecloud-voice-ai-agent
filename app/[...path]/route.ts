import { env } from "cloudflare:workers";
import { handleRequest } from "@/lib/http";
import type { AppEnv } from "@/lib/auth";
const handler = (request: Request) =>
  handleRequest(request, env as unknown as AppEnv);
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;

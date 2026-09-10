import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: unknown,
  ) {
    super(message);
  }
}
export function errorDetails(e: unknown) {
  if (e instanceof ZodError)
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted fields.",
      fields: e.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    };
  if (e instanceof AppError)
    return {
      status: e.status,
      code: e.code,
      message: e.message,
      fields: e.fields,
    };
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "We could not complete this request. Please try again.",
  };
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(
    { data, error: null },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
}
export function failure(e: unknown, requestId = crypto.randomUUID()) {
  const d = errorDetails(e);
  console.error(
    JSON.stringify({
      event: "request_failed",
      request_id: requestId,
      code: d.code,
      status: d.status,
    }),
  );
  return Response.json(
    {
      data: null,
      error: {
        code: d.code,
        message: d.message,
        ...(d.fields ? { fields: d.fields } : {}),
        request_id: requestId,
      },
    },
    {
      status: d.status,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    },
  );
}
export async function readJson(request: Request, max = 65536) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    throw new AppError(400, "INVALID_CONTENT_TYPE", "Send application/json.");
  if (Number(request.headers.get("content-length")) > max)
    throw new AppError(413, "BODY_TOO_LARGE", "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(400, "INVALID_JSON", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, "INVALID_JSON", "The body must be valid JSON.");
  }
}

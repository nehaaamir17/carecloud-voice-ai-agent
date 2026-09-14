import { createServer } from "node:http";

const upstreamValue = process.env.UPSTREAM_ORIGIN;
if (!upstreamValue) {
  throw new Error("UPSTREAM_ORIGIN is required.");
}

const upstream = new URL(upstreamValue);
if (upstream.protocol !== "https:") {
  throw new Error("UPSTREAM_ORIGIN must use HTTPS.");
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
const maxBodyBytes = 2 * 1024 * 1024;
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (!value || hopByHopHeaders.has(name) || name === "host") continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  // The upstream protects cookie-authenticated writes with a same-origin check.
  // Requests are still same-origin at the public gateway, so translate that
  // origin to the upstream origin before forwarding.
  if (headers.has("origin")) headers.set("origin", upstream.origin);
  if (headers.has("referer")) {
    try {
      const referer = new URL(headers.get("referer"));
      headers.set(
        "referer",
        new URL(referer.pathname + referer.search, upstream).toString(),
      );
    } catch {
      headers.delete("referer");
    }
  }
  headers.set("x-forwarded-host", request.headers.host || "");
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function copyResponseHeaders(response, outgoing, publicOrigin) {
  for (const [name, value] of response.headers) {
    const lower = name.toLowerCase();
    if (
      hopByHopHeaders.has(lower) ||
      lower === "content-length" ||
      lower === "content-encoding" ||
      lower === "set-cookie" ||
      lower === "location"
    )
      continue;
    outgoing.setHeader(name, value);
  }

  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, upstream);
    if (target.origin === upstream.origin) {
      const publicUrl = new URL(target.pathname + target.search, publicOrigin);
      outgoing.setHeader("location", publicUrl.toString());
    } else {
      outgoing.setHeader("location", location);
    }
  }

  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) outgoing.setHeader("set-cookie", cookies);
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", upstream);
    const publicOrigin = `https://${request.headers.host || "localhost"}`;
    const method = request.method || "GET";
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : await readBody(request);
    const upstreamResponse = await fetch(requestUrl, {
      method,
      headers: requestHeaders(request),
      body,
      redirect: "manual",
    });

    response.statusCode = upstreamResponse.status;
    response.statusMessage = upstreamResponse.statusText;
    copyResponseHeaders(upstreamResponse, response, publicOrigin);
    response.setHeader("x-carecloud-gateway", "railway");
    response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    const status = Number(error?.status) || 502;
    response.statusCode = status;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        data: null,
        error: {
          code: status === 413 ? "BODY_TOO_LARGE" : "UPSTREAM_UNAVAILABLE",
          message:
            status === 413
              ? "Request body is too large."
              : "The CareCloud service is temporarily unavailable.",
        },
      }),
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`CareCloud Railway gateway listening on port ${port}`);
});

function shutDown(signal) {
  console.log(`${signal} received; closing the CareCloud Railway gateway.`);
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGTERM", () => shutDown("SIGTERM"));
process.on("SIGINT", () => shutDown("SIGINT"));

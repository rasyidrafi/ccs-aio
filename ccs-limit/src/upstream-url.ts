/**
 * Resolve an incoming request target against the configured upstream without
 * allowing an absolute-form target to override the upstream host.
 *
 * HTTP clients talking to a forward proxy may send a request target such as
 * `http://example.com/path`. Passing that directly to `new URL(target, base)`
 * would turn this reverse proxy into an open proxy.
 */
export function resolveUpstreamUrl(
  requestTarget: string | undefined,
  upstreamUrl: string,
): URL {
  const incoming = new URL(requestTarget || "/", "http://request.invalid");
  const upstream = new URL(upstreamUrl);

  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  upstream.hash = "";
  return upstream;
}

export function isUnsafeAbsoluteRequestTarget(
  requestTarget: string | undefined,
): boolean {
  const target = requestTarget || "/";
  return target.startsWith("//") || /^[a-z][a-z\d+.-]*:\/\//i.test(target);
}

export function getRequestPath(requestTarget: string | undefined): string {
  const target = requestTarget || "/";
  const queryIndex = target.indexOf("?");
  const hashIndex = target.indexOf("#");
  let end = target.length;
  if (queryIndex >= 0 && queryIndex < end) end = queryIndex;
  if (hashIndex >= 0 && hashIndex < end) end = hashIndex;
  return target.slice(0, end) || "/";
}

export function getAbsoluteRequestTarget(absoluteUrl: string): string {
  const schemeEnd = absoluteUrl.indexOf("://");
  if (schemeEnd < 0) return absoluteUrl || "/";
  const pathStart = absoluteUrl.indexOf("/", schemeEnd + 3);
  return pathStart < 0 ? "/" : absoluteUrl.slice(pathStart);
}

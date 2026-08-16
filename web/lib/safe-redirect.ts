// Fixed fake origin used only to resolve `returnTo` through the URL parser.
// Browsers normalize backslashes and repeated slashes right after the leading
// "/" the same way for special (http/https) schemes, so resolving against a
// fixed base and checking the resulting origin catches every such variant
// (e.g. "//evil.com", "/\\evil.com", "/\\/evil.com") without having to
// enumerate them via regex — closing the CWE-601 open redirect for good.
const SAFE_REDIRECT_BASE = "http://localhost";

export function resolveSafeRedirect(returnTo: FormDataEntryValue | null): string {
  if (typeof returnTo !== "string" || returnTo.length === 0) {
    return "/dashboard";
  }

  let resolved: URL;
  try {
    resolved = new URL(returnTo, SAFE_REDIRECT_BASE);
  } catch {
    return "/dashboard";
  }

  if (resolved.origin !== SAFE_REDIRECT_BASE) {
    return "/dashboard";
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

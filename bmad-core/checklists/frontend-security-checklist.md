<!-- Powered by Stella AI Team -->

# Frontend Security Checklist

Audit frontend files touched by an implementation plan against common web security vulnerabilities. Execute every item against the scoped files only — never assume, always read the code.

[[LLM: INITIALIZATION INSTRUCTIONS - FRONTEND SECURITY AUDIT

FILE SCOPE DEFINITIONS (use these labels throughout the checklist):

- CLIENT SCRIPT FILES: any file containing client-side logic — components, modules, utilities, and any template file with embedded script blocks
- MARKUP TEMPLATE FILES: any file responsible for rendering HTML output — static HTML, server-rendered templates, and client-side view components
- FRONTEND CONFIG FILES: any build-tool, bundler, framework, or server configuration file that governs how the frontend is compiled, served, or secured

IMPORTANT: Mark [PASS] only after reading the code — never assume. Every [FAIL] requires file:line, offending snippet, severity, and fix. Every [N/A] requires a one-sentence reason.

SEVERITY — assign one to every FAIL:

- CRITICAL: Directly exploitable, no user interaction needed
- HIGH: Exploitable with moderate attacker effort
- MEDIUM: Weakens defense-in-depth, not directly exploitable alone
- LOW: Best practice deviation, minimal direct risk

EXECUTION APPROACH:

1. Work through each section in order — do not skip sections
2. For each item, inspect the relevant files and mark [PASS], [FAIL], or [N/A]
3. Every [FAIL] must include: file path, line number, exact offending code snippet, severity, and required fix
4. Every [N/A] must include a one-sentence reason why the item cannot apply to the scoped files
5. Do not infer PASS — only mark PASS after reading the relevant code and confirming the condition is met

The goal is evidence-based findings, not assumptions.]]

## 1. CSP CONFIGURATION

[[LLM: A misconfigured CSP is the most common XSS amplifier. Check `<meta>` CSP tags and all FRONTEND CONFIG FILES — mark section N/A if no CSP config is in scope.]]

- [ ] `script-src` has no `'unsafe-inline'` without a nonce or hash expression in the same directive.
- [ ] `script-src` has no `'unsafe-eval'`.
- [ ] `style-src` has no `'unsafe-inline'` without a nonce or hash expression in the same directive.
- [ ] `object-src` is explicitly set to `'none'`.
- [ ] `base-uri` is explicitly set to `'none'` or `'self'`.
- [ ] `form-action` is explicitly defined and contains no `*` or untrusted external origins.
- [ ] `script-src` contains no wildcard CDN subdomain (e.g., `*.googleapis.com`, `*.cloudflare.com`).
- [ ] `default-src` is defined as a policy fallback.

---

## 2. INLINE SCRIPTS & EVAL IN MARKUP

[[LLM: Inline scripts silently bypass CSP — find every one. Inspect all MARKUP TEMPLATE FILES: every `<script>` tag, element event attributes, and href/src/action values.]]

- [ ] All `<script>` tags have a `nonce` attribute when the project uses nonce-based CSP.
- [ ] No `<script>` tag has a hardcoded static nonce value (same value across responses).
- [ ] No HTML element has an inline `on*` event handler attribute (`onclick`, `onerror`, `onload`, etc.).
- [ ] No `href`, `src`, or `action` attribute contains a `javascript:` URL.
- [ ] All inline `<style>` blocks have a nonce or hash when `style-src` restricts inline styles.

---

## 3. DANGEROUS DOM SINKS

[[LLM: DOM sinks are the primary XSS vector. Inspect all CLIENT SCRIPT FILES — for each sink, trace to its source and FAIL if untrusted input (URL params, hash, user input, API data) reaches it without an explicit sanitization call (e.g., DOMPurify.sanitize()).]]

- [ ] `innerHTML` is not assigned from any untrusted source without prior sanitization.
- [ ] `outerHTML` is not assigned from any untrusted source without sanitization.
- [ ] `insertAdjacentHTML()` second argument is not derived from untrusted input without sanitization.
- [ ] `document.write()` is not called with dynamic or externally-sourced content.
- [ ] `eval()` is not called with a non-literal argument.
- [ ] `new Function()` is not constructed from dynamic or external input.
- [ ] `setTimeout()` and `setInterval()` are not called with a string as the first argument.

---

## 4. SUBRESOURCE INTEGRITY (SRI)

[[LLM: External resources without integrity checks can be silently replaced by a compromised CDN. Find every external `<script src>` and `<link rel="stylesheet" href>` (non-self domain) in MARKUP TEMPLATE FILES and evaluate each tag separately.]]

- [ ] Every external `<script src="...">` has an `integrity` attribute with a valid `sha256-`, `sha384-`, or `sha512-` hash.
- [ ] Every external `<link rel="stylesheet" href="...">` has an `integrity` attribute with a valid hash.
- [ ] Every element with an `integrity` attribute also has `crossorigin="anonymous"`.

---

## 5. MIXED CONTENT & HTTPS

[[LLM: Mixed content exposes HTTPS pages to interception. Search MARKUP TEMPLATE FILES for hardcoded `http://` in resource attributes, CLIENT SCRIPT FILES for `http://` in network calls, and FRONTEND CONFIG FILES for upgrade-insecure-requests.]]

- [ ] No markup attribute (`src`, `href`, `action`, `data`, `poster`) contains a hardcoded `http://` URL.
- [ ] No `fetch()`, `XMLHttpRequest`, or `axios` call uses a hardcoded `http://` endpoint URL.
- [ ] `upgrade-insecure-requests` is present in the CSP config if any `http://` resource URLs exist in the scoped files.

---

## 6. FRAME & EMBED CONTROLS

[[LLM: Missing frame controls enable clickjacking. Check MARKUP TEMPLATE FILES for `<base>` and `<iframe>` tags, and FRONTEND CONFIG FILES for X-Frame-Options — mark that item N/A if no server config is in scope.]]

- [ ] No `<base href="...">` tag is present unless justified by a documented requirement in the implementation plan.
- [ ] Every cross-origin `<iframe>` has a `sandbox` attribute with explicitly listed minimum permissions.
- [ ] Clickjacking is prevented via CSP `frame-ancestors` (not `*` or absent) in CSP config, and `X-Frame-Options` set to `DENY` or `SAMEORIGIN` in server config as a non-CSP fallback for older browsers.

---

## 7. SENSITIVE DATA EXPOSURE

[[LLM: Client-side code is fully visible to any user — treat every token, key, and credential as exposed. Inspect all CLIENT SCRIPT FILES and FRONTEND CONFIG FILES, flagging hardcoded secrets, insecure storage writes, and logging of sensitive data.]]

- [ ] No frontend file contains a hardcoded API key, auth token, password, or secret as a string literal.
- [ ] `localStorage.setItem()` and `sessionStorage.setItem()` do not store raw auth tokens, session IDs, passwords, or unencrypted PII.
- [ ] `console.*` calls do not output auth tokens, credentials, sensitive API responses, or PII.
- [ ] Sensitive values are not appended to URL query parameters in client-side navigation or redirect calls.

---

## 8. UNTRUSTED INPUT HANDLING

[[LLM: Unvalidated external input is the root cause of injection and redirect attacks. Inspect all CLIENT SCRIPT FILES — focus on postMessage origin validation and open-redirect prevention. DOM sink coverage for URL-derived inputs is in Section 3.]]

- [ ] All `window.addEventListener('message', ...)` handlers validate `event.origin` against an explicit allowlist before processing `event.data`.
- [ ] `JSON.parse()` on external, URL-sourced, or `postMessage` data is wrapped in `try/catch`.
- [ ] User-controlled input in `window.location.href`, `window.location.replace()`, or `window.open()` is validated against a URL or origin allowlist before use.

---

## FINAL CONFIRMATION

[[LLM: FINAL SECURITY AUDIT SUMMARY

After completing all checklist items:

1. Count totals: PASS, FAIL, N/A across all 8 sections
2. List every FAIL grouped by section with severity, location, and required fix
3. State the highest severity level found (CRITICAL / HIGH / MEDIUM / LOW / NONE)
4. Confirm: "All checklist items evaluated. No item skipped."
5. Do not write to the plan file — the task will handle that

Every PASS must be based on having read the code, not assumed.]]

- [ ] I, the Security Agent, confirm that every checklist item above has been evaluated against the scoped files, no item has been silently skipped, and every FAIL includes an exact file:line location and severity classification.

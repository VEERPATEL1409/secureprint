/**
 * URL resolution & QR target parser for SecurePrint.
 * Ensures customer QR codes always use the publicly accessible origin (e.g. ais-pre-*)
 * rather than developer-locked preview origins (ais-dev-*) that block external phones.
 */

export function toPublicShareableOrigin(rawOrigin: string): string {
  if (!rawOrigin) return '';
  let clean = rawOrigin.trim().replace(/\/+$/, '');
  // Google AI Studio dev containers (ais-dev-*) require developer auth cookies and
  // redirect external customer phones to an auth/error screen. Rewrite to public ais-pre-*.
  if (clean.includes('://ais-dev-')) {
    clean = clean.replace('://ais-dev-', '://ais-pre-');
  }
  return clean;
}

export function isDevPreviewOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.location?.origin?.includes('://ais-dev-'));
}

export function getPublicAppOrigin(): string {
  // 1. Check custom override saved by shopkeeper in settings/localstorage
  try {
    const custom = localStorage.getItem('secureprint_custom_desk_origin');
    if (custom && custom.startsWith('http') && !custom.includes('aistudio.google.com')) {
      const normalizedCustom = toPublicShareableOrigin(custom);
      if (normalizedCustom !== custom) {
        localStorage.setItem('secureprint_custom_desk_origin', normalizedCustom);
      }
      return normalizedCustom;
    }
  } catch {
    // ignore storage errors
  }

  // 2. Check window.location.origin first (most accurate for deployed & shared Cloud Run URLs)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (!origin.includes('aistudio.google.com')) {
      return toPublicShareableOrigin(origin);
    }
  }

  // 3. Check injected VITE_APP_URL or APP_URL env variable if explicitly set
  try {
    const metaEnv = (import.meta as any)?.env?.VITE_APP_URL || '';
    const envUrl = (
      metaEnv ||
      (typeof process !== 'undefined' ? (process as any)?.env?.APP_URL : '') ||
      ''
    ).trim();
    if (envUrl && !envUrl.includes('MY_APP_URL') && !envUrl.includes('aistudio.google.com')) {
      return toPublicShareableOrigin(envUrl);
    }
  } catch {
    // ignore
  }

  // 4. Default fallback to current host
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol || 'https:';
    return toPublicShareableOrigin(`${proto}//${window.location.host}`);
  }

  return '';
}

export function getShopCustomerUrl(publicCode: string): string {
  const origin = getPublicAppOrigin();
  const cleanCode = (publicCode || 'shop').trim();
  const path = `/s/${encodeURIComponent(cleanCode)}`;
  return origin ? `${origin}${path}` : path;
}

export function setCustomAppOrigin(origin: string): void {
  try {
    const clean = toPublicShareableOrigin(origin);
    if (clean) {
      localStorage.setItem('secureprint_custom_desk_origin', clean);
    } else {
      localStorage.removeItem('secureprint_custom_desk_origin');
    }
  } catch {
    // ignore
  }
}

export function resetAppOrigin(): void {
  try {
    localStorage.removeItem('secureprint_custom_desk_origin');
  } catch {
    // ignore
  }
}

const RESERVED_SHOP_PORTAL_SEGMENTS = new Set([
  'login',
  'register',
  'forgot-password',
  'verify',
  'pending-approval',
  'dashboard',
  'queue',
  'jobs',
  'customers',
  'history',
  'blocked',
  'reports',
  'qr',
  'settings',
  'profile'
]);

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeShopIdentifier(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const decoded = safeDecodeURIComponent(candidate)
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!decoded) return null;
  // Valid shop public IDs / counter codes / Firestore doc IDs are alphanumeric with hyphens or underscores
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(decoded)) {
    return null;
  }
  return decoded;
}

function extractShopIdFromParsedUrl(url: URL): string | null {
  const candidates: Array<{ pathname: string; searchParams: URLSearchParams }> = [
    { pathname: url.pathname, searchParams: url.searchParams }
  ];

  // Also inspect hash-router paths such as #/s/patel-694 or #!/s/patel-694?shop=...
  if (url.hash && url.hash.length > 1) {
    const rawHash = url.hash.replace(/^#!?/, '');
    if (rawHash.startsWith('/') || rawHash.includes('?')) {
      try {
        const normalizedHash = rawHash.startsWith('/') ? rawHash : `/${rawHash}`;
        const hashUrl = new URL(normalizedHash, 'https://secureprint.local');
        candidates.push({ pathname: hashUrl.pathname, searchParams: hashUrl.searchParams });
      } catch {
        // ignore malformed hash fragment
      }
    }
  }

  for (const { pathname, searchParams } of candidates) {
    const cleanPath = pathname.replace(/\/+$/, '');

    // 1. Primary customer route: /s/:shopPublicId
    const shopRouteMatch = cleanPath.match(/(?:^|\/)s\/([^/?#]+)/i);
    if (shopRouteMatch?.[1]) {
      const id = sanitizeShopIdentifier(shopRouteMatch[1]);
      if (id) return id;
    }

    // 2. Alternate /shop/:shopPublicId link (excluding internal shop owner portal routes)
    const altShopMatch = cleanPath.match(/^\/shop\/([^/?#]+)$/i);
    if (altShopMatch?.[1]) {
      const segment = safeDecodeURIComponent(altShopMatch[1]).trim();
      if (!RESERVED_SHOP_PORTAL_SEGMENTS.has(segment.toLowerCase())) {
        const id = sanitizeShopIdentifier(segment);
        if (id) return id;
      }
    }

    // 3. Query parameter fallbacks (?shopPublicId=..., ?publicCode=..., ?shop=..., ?code=...)
    const queryKeys = ['shopPublicId', 'publicCode', 'shopId', 'shop', 'code'];
    for (const key of queryKeys) {
      const paramVal = searchParams.get(key);
      const id = sanitizeShopIdentifier(paramVal);
      if (id) return id;
    }
  }

  return null;
}

function tryBuildUrlCandidate(trimmed: string): URL | null {
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed);
    } catch {
      return null;
    }
  }

  // Relative paths like /s/patel-694, s/patel-694, /c/sess_123, /?shop=patel-694
  if (
    trimmed.startsWith('/') ||
    /^s\/[^/\s]+/i.test(trimmed) ||
    /^(?:session|c)\/[^/\s]+/i.test(trimmed) ||
    trimmed.startsWith('?')
  ) {
    try {
      const normalized = trimmed.startsWith('/') || trimmed.startsWith('?') ? trimmed : `/${trimmed}`;
      return new URL(normalized, 'https://secureprint.local');
    } catch {
      return null;
    }
  }

  // Protocol-less host URLs like ais-pre-...run.app/s/patel-694 or localhost:3000/s/patel-694
  if (
    /^(?:localhost(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?)(?:[/?#]|$)/i.test(trimmed)
  ) {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extracts the shop public ID (`shopPublicId`) from a scanned QR code URL,
 * protocol-less link, hash route, query string, or plain counter code.
 * Returns `null` if the payload is unrelated (e.g. UPI/Wi-Fi QR or external domain without a shop ID).
 */
export function extractShopPublicId(rawInput: string): string | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Reject non-web QR payloads immediately (UPI, Wi-Fi, mailto, tel, vCard, data URIs, etc.)
  if (/^(?:upi|wifi|mailto|tel|sms|smsto|geo|javascript|data|bitcoin|ethereum):/i.test(trimmed)) {
    return null;
  }
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    return null;
  }

  // 1. Parse full, relative, or protocol-less URLs
  const parsedUrl = tryBuildUrlCandidate(trimmed);
  if (parsedUrl) {
    return extractShopIdFromParsedUrl(parsedUrl);
  }

  // 2. Reject strings containing URL schemes, slashes, dots, or query punctuation that failed URL extraction
  if (/[:/?#.;@]/.test(trimmed.replace(/^[#@]+/, ''))) {
    return null;
  }

  // 3. Direct counter code / shopPublicId (e.g. "patel-694" or "#patel-694")
  const cleanedCode = trimmed.replace(/^[#@\s]+/, '').replace(/\s+/g, '-');
  if (cleanedCode.length < 2) {
    return null;
  }

  return sanitizeShopIdentifier(cleanedCode);
}

/**
 * Parses any QR scan payload, full URL, session link, or typed counter code
 * into an internal React Router destination path (primarily `/s/:shopPublicId`).
 */
export function parseScannedShopTarget(rawInput: string): string | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Primary path: extract shopPublicId and route to /s/:shopPublicId
  const shopPublicId = extractShopPublicId(trimmed);
  if (shopPublicId) {
    return `/s/${encodeURIComponent(shopPublicId)}`;
  }

  // 2. Secondary support: direct active customer session link (/c/:sessionId or /session/:sessionId)
  const parsedUrl = tryBuildUrlCandidate(trimmed);
  if (parsedUrl) {
    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');
    const sessionMatch = cleanPath.match(/(?:^|\/)(?:session|c)\/([^/?#]+)/i);
    if (sessionMatch?.[1]) {
      const sessionId = sanitizeShopIdentifier(sessionMatch[1]);
      if (sessionId) {
        return `/c/${encodeURIComponent(sessionId)}${parsedUrl.search || ''}`;
      }
    }
  }

  return null;
}

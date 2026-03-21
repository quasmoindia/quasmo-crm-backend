/**
 * Indian GSTIN format (15 chars): state + PAN + entity + Z + checksum
 */
export function isValidGstinFormat(gstin: string): boolean {
  const s = gstin.trim().toUpperCase().replace(/\s/g, '');
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(s);
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

/** Build address from GST portal-style `pradr.addr` object */
function formatPradrAddr(addr: Record<string, unknown>): string | undefined {
  const parts = [
    str(addr.bnm),
    str(addr.st),
    str(addr.loc),
    str(addr.dst),
    str(addr.stcd),
    str(addr.pncd),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Normalize various GST verification API JSON shapes into a single structure.
 * Supports common third-party keys and GST portal-style nested objects.
 */
export function mapGstLookupResponse(data: unknown): {
  legalName?: string;
  tradeName?: string;
  address?: string;
  status?: string;
} {
  if (!data || typeof data !== 'object') return {};

  const root = data as Record<string, unknown>;
  const inner =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.result && typeof root.result === 'object'
        ? (root.result as Record<string, unknown>)
        : root;

  let legalName =
    str(inner.legalName) ||
    str(inner.lgnm) ||
    str(inner.legal_name) ||
    str(inner.LegalName) ||
    str(inner.legalname);

  let tradeName =
    str(inner.tradeName) ||
    str(inner.tradeNam) ||
    str(inner.trade_name) ||
    str(inner.bn) ||
    str(inner.business_name) ||
    str(inner.BusinessName) ||
    str(inner.tradename);

  let address =
    str(inner.address) ||
    str(inner.principalPlace) ||
    str(inner.principal_place) ||
    str(inner.fullAddress) ||
    str(inner.registeredAddress);

  if (!address && inner.pradr && typeof inner.pradr === 'object') {
    const pr = inner.pradr as Record<string, unknown>;
    const ad = pr.addr;
    if (ad && typeof ad === 'object') {
      address = formatPradrAddr(ad as Record<string, unknown>);
    }
    if (!address) address = str(pr.adr) || str(pr.addr);
  }

  const status =
    str(inner.status) ||
    str(inner.sts) ||
    str(inner.gstin_status) ||
    str(inner.registrationStatus);

  if (!legalName && !tradeName) {
    legalName = str(root.legalName) || str(root.lgnm);
    tradeName = str(root.tradeName) || str(root.tradeNam) || str(root.business_name);
  }

  return {
    legalName,
    tradeName,
    address,
    status,
  };
}

export function suggestedCompanyName(m: { legalName?: string; tradeName?: string }): string | undefined {
  const t = m.tradeName?.trim();
  const l = m.legalName?.trim();
  if (t && l && t.toLowerCase() !== l.toLowerCase()) return `${t} (${l})`;
  return t || l;
}

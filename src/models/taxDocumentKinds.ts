export const TAX_DOCUMENT_KINDS = ['tax_invoice', 'proforma', 'quotation'] as const;
export type TaxDocumentKind = (typeof TAX_DOCUMENT_KINDS)[number];

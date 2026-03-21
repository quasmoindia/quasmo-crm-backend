# Quasmo CRM – Backend

## Tax invoices & PDF

- **API:** `GET/POST /api/invoices`, `GET/PATCH/DELETE /api/invoices/:id`, `GET /api/invoices/:id/preview` (JSON `{ html }`), `GET /api/invoices/:id/pdf` (file download).
- **Bank master:** `GET/POST /api/bank-accounts`, `PATCH/DELETE /api/bank-accounts/:id` (delete admin-only). Used to pre-fill invoice bank blocks.
- **PDF** uses [Puppeteer](https://pptr.dev/) (bundled Chromium). On Linux servers without a display, install Chromium dependencies or set:

  `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome`

- **Roles:** Module id `invoices`. Add it to roles in **Role management** if your DB still has old role documents without this module (Admin has `*` by default).

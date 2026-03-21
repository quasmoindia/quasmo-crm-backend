/**
 * HTML → PDF via Puppeteer (Chromium). Set PUPPETEER_EXECUTABLE_PATH if needed on Linux servers.
 */
export async function renderInvoicePdf(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}

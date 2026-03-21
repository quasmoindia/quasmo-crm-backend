import express from 'express';
import multer from 'multer';
import * as taxInvoiceController from '../controllers/taxInvoiceController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const uploadSignatures = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(protect);
router.use(requireModule('invoices'));

router.get('/', taxInvoiceController.listTaxInvoices);
router.post('/', taxInvoiceController.createTaxInvoice);

router.get('/:id/preview', taxInvoiceController.getTaxInvoicePreview);
router.get('/:id/pdf', taxInvoiceController.getTaxInvoicePdf);
router.post(
  '/:id/signatures',
  uploadSignatures.fields([
    { name: 'signature', maxCount: 1 },
    { name: 'stamp', maxCount: 1 },
    { name: 'digitalSignature', maxCount: 1 },
  ]) as unknown as express.RequestHandler,
  taxInvoiceController.uploadTaxInvoiceSignatures
);
router.get('/:id', taxInvoiceController.getTaxInvoiceById);
router.patch('/:id', taxInvoiceController.updateTaxInvoice);
router.delete('/:id', requireAdmin, taxInvoiceController.deleteTaxInvoice);

export default router;

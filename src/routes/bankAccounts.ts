import express from 'express';
import multer from 'multer';
import * as bankAccountController from '../controllers/bankAccountController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';
import { MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';

const router = express.Router();

const uploadQr = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

router.use(protect);
router.use(requireModule('invoices'));

router.get('/', bankAccountController.listBankAccounts);
router.post(
  '/upload-qr-image',
  uploadQr.single('qr') as unknown as express.RequestHandler,
  bankAccountController.uploadBankQrImage
);
router.post('/', bankAccountController.createBankAccount);
router.patch('/:id', bankAccountController.updateBankAccount);
router.delete('/:id', requireAdmin, bankAccountController.deleteBankAccount);

export default router;

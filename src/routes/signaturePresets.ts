import express from 'express';
import multer from 'multer';
import * as signaturePresetController from '../controllers/signaturePresetController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';
import { MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';

const router = express.Router();

const uploadImg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

router.use(protect);
router.use(requireModule('invoices'));

router.get('/', signaturePresetController.listSignaturePresets);
router.post(
  '/upload-image',
  uploadImg.single('image') as unknown as express.RequestHandler,
  signaturePresetController.uploadSignaturePresetImage
);
router.post('/', signaturePresetController.createSignaturePreset);
router.patch('/:id', signaturePresetController.updateSignaturePreset);
router.delete('/:id', requireAdmin, signaturePresetController.deleteSignaturePreset);

export default router;

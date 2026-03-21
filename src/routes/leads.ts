import express from 'express';
import multer from 'multer';
import * as leadController from '../controllers/leadController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const uploadBulk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const uploadAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(protect);
router.use(requireModule('leads'));

router.get('/', leadController.listLeads);
router.get('/users', leadController.listAssignableUsers);
router.get('/export', leadController.exportLeads);
router.get('/gst-lookup', leadController.lookupGstin);
router.post('/', leadController.createLead);
router.post('/bulk-upload', uploadBulk.single('file') as unknown as express.RequestHandler, leadController.bulkUploadLeads);
router.get('/:id', leadController.getLeadById);
router.post('/:id/documents', leadController.addLeadDocument);
router.post(
  '/:id/attachments',
  uploadAttachments.array('files', 10) as unknown as express.RequestHandler,
  leadController.uploadLeadAttachments
);
router.patch('/:id', leadController.updateLead);
router.delete('/:id', requireAdmin, leadController.deleteLead);

export default router;

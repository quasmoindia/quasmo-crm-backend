import express from 'express';
import multer from 'multer';
import * as leadController from '../controllers/leadController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(protect);
router.use(requireModule('leads'));

router.get('/', leadController.listLeads);
router.get('/users', leadController.listAssignableUsers);
router.get('/export', leadController.exportLeads);
router.post('/', leadController.createLead);
router.post('/bulk-upload', upload.single('file') as unknown as express.RequestHandler, leadController.bulkUploadLeads);
router.get('/:id', leadController.getLeadById);
router.patch('/:id', leadController.updateLead);
router.delete('/:id', requireAdmin, leadController.deleteLead);

export default router;

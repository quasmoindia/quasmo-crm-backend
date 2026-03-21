import express from 'express';
import multer from 'multer';
import * as complaintController from '../controllers/complaintController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(protect);
router.use(requireModule('complaints'));

router.post('/', complaintController.createComplaint);
router.post('/bulk', complaintController.createComplaintsBulk);
router.get('/', complaintController.listComplaints);
router.get('/users', complaintController.listAssignableUsers);
router.get('/:id', complaintController.getComplaintById);
router.post('/:id/comments', complaintController.addComplaintComment);
router.patch('/:id', complaintController.updateComplaint);
router.post('/:id/images', upload.array('images', 10) as unknown as express.RequestHandler, complaintController.uploadComplaintImages);
router.delete('/:id', requireAdmin, complaintController.deleteComplaint);

export default router;

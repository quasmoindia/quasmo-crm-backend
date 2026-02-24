import express from 'express';
import * as complaintController from '../controllers/complaintController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', complaintController.createComplaint);
router.post('/bulk', complaintController.createComplaintsBulk);
router.get('/', complaintController.listComplaints);
router.get('/:id', complaintController.getComplaintById);
router.patch('/:id', complaintController.updateComplaint);
router.delete('/:id', complaintController.deleteComplaint);

export default router;

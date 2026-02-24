import express from 'express';
import authRoutes from './auth.js';
import complaintRoutes from './complaints.js';
import userRoutes from './users.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);
router.use('/users', userRoutes);

export default router;

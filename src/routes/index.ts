import express from 'express';
import authRoutes from './auth.js';
import complaintRoutes from './complaints.js';
import leadRoutes from './leads.js';
import userRoutes from './users.js';
import roleRoutes from './roles.js';
import configRoutes from './config.js';
import messageRoutes from './messages.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/config', configRoutes);
router.use('/complaints', complaintRoutes);
router.use('/leads', leadRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/messages', messageRoutes);

export default router;

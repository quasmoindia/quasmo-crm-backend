import express from 'express';
import authRoutes from './auth.js';
import hexaAuthRoutes from './hexaAuth.js';
import complaintRoutes from './complaints.js';
import leadRoutes from './leads.js';
import userRoutes from './users.js';
import hexaUserRoutes from './hexaUsers.js';
import roleRoutes from './roles.js';
import configRoutes from './config.js';
import messageRoutes from './messages.js';
import taxInvoiceRoutes from './taxInvoices.js';
import bankAccountRoutes from './bankAccounts.js';
import signaturePresetRoutes from './signaturePresets.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/hexa-auth', hexaAuthRoutes);
router.use('/config', configRoutes);
router.use('/complaints', complaintRoutes);
router.use('/leads', leadRoutes);
router.use('/invoices', taxInvoiceRoutes);
router.use('/bank-accounts', bankAccountRoutes);
router.use('/signature-presets', signaturePresetRoutes);
router.use('/users', userRoutes);
router.use('/hexa-users', hexaUserRoutes);
router.use('/roles', roleRoutes);
router.use('/messages', messageRoutes);

export default router;

import express from 'express';
import * as bankAccountController from '../controllers/bankAccountController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(requireModule('invoices'));

router.get('/', bankAccountController.listBankAccounts);
router.post('/', bankAccountController.createBankAccount);
router.patch('/:id', bankAccountController.updateBankAccount);
router.delete('/:id', requireAdmin, bankAccountController.deleteBankAccount);

export default router;

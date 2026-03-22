import express from 'express';
import * as rolesController from '../controllers/rolesController.js';
import { protect, requireModule, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(requireModule('roles'));

router.get('/', rolesController.listRoles);
router.post('/', rolesController.createRole);
router.delete('/:id', requireAdmin, rolesController.deleteRole);
router.patch('/:id', rolesController.updateRole);

export default router;

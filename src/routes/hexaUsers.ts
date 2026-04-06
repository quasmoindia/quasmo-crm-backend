import express from 'express';
import * as hexaUsersController from '../controllers/hexaUsersController.js';
import { protect, requireModule } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(requireModule('users'));

router.get('/', hexaUsersController.listHexaUsers);
router.post('/', hexaUsersController.createHexaUser);

export default router;

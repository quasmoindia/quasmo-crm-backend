import express from 'express';
import * as usersController from '../controllers/usersController.js';
import { protect, requireModule } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(requireModule('users'));

router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.patch('/:id', usersController.updateUser);

export default router;

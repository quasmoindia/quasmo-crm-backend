import express from 'express';
import * as usersController from '../controllers/usersController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);

export default router;

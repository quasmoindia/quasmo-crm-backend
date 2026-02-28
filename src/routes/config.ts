import express from 'express';
import * as configController from '../controllers/configController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/roles', protect, configController.getRolesConfig);

export default router;

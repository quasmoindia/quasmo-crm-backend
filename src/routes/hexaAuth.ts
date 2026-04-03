import express from 'express';
import * as hexaAuthController from '../controllers/hexaAuthController.js';

const router = express.Router();

router.post('/signup', hexaAuthController.signup);
router.post('/login', hexaAuthController.login);

export default router;

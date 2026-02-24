import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);

router.get('/me', protect, (req, res) => {
  res.json({ user: { id: req.user!._id, fullName: req.user!.fullName, email: req.user!.email } });
});

export default router;

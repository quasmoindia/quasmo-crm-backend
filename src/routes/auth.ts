import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { getRoleModuleIds } from '../services/roleCache.js';

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);

router.get('/me', protect, (req, res) => {
  const u = req.user!;
  const roleModules = getRoleModuleIds(u.role ?? '') ?? ['*'];
  res.json({
    user: {
      id: u._id,
      fullName: u.fullName,
      email: u.email,
      role: u.role ?? '',
      roleModules,
    },
  });
});

export default router;

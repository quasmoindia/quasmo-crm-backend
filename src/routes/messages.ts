import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import * as messageController from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';
import { canAccessModule } from '../services/roleCache.js';

const router = express.Router();

/** Allow access if user has either 'users' or 'complaints' module */
function requireUsersOrComplaints(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  if (canAccessModule(req.user.role, 'users') || canAccessModule(req.user.role, 'complaints')) {
    next();
    return;
  }
  res.status(403).json({ message: 'You do not have access to messaging' });
}

router.use(protect);
router.use(requireUsersOrComplaints);

router.get('/', messageController.getThread);
router.post('/send', messageController.sendMessage);

export default router;

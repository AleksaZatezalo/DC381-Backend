import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { getSettings, updateSetting } from '../controllers/settings.controller.js';

const r = Router();

r.get('/', authenticateToken, requireAdmin, getSettings);
r.put('/:key', authenticateToken, requireAdmin, updateSetting);

export default r;

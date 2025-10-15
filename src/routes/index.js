import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import settingsRoutes from './settings.routes.js';
import forumRoutes from './forum.routes.js';
import eventsRoutes from './events.routes.js';

const router = Router();

// base routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/admin/settings', settingsRoutes);
router.use('/forum', forumRoutes);
router.use('/events', eventsRoutes);

export default router;

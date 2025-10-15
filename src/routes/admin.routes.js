import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  dashboard, listUsers, toggleUserAdmin, toggleUserActive,
  listAllEvents, createEvent, updateEvent, deleteEvent, togglePublished
} from '../controllers/admin.controller.js';

const r = Router();

r.get('/dashboard', authenticateToken, requireAdmin, dashboard);
r.get('/users', authenticateToken, requireAdmin, listUsers);
r.put('/users/:userId/toggle-admin', authenticateToken, requireAdmin, toggleUserAdmin);
r.put('/users/:userId/toggle-active', authenticateToken, requireAdmin, toggleUserActive);

// Admin events
r.get('/events', authenticateToken, requireAdmin, listAllEvents);
r.post('/events', authenticateToken, requireAdmin, createEvent);
r.put('/events/:eventId', authenticateToken, requireAdmin, updateEvent);
r.delete('/events/:eventId', authenticateToken, requireAdmin, deleteEvent);
r.put('/events/:eventId/toggle-published', authenticateToken, requireAdmin, togglePublished);

export default r;

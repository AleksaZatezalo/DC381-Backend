import { Router } from 'express';
import { listPublicEvents } from '../controllers/events.controller.js';

const r = Router();
r.get('/', listPublicEvents); // public
export default r;

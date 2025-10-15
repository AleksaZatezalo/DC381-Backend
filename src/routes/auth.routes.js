import { Router } from 'express';
import {
  register, uploadProfilePic, login, profile, logout,
  changePassword, updateProfile, getSecurityQuestion,
  recoverPassword, listSecurityQuestions, verifyAccessCode
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// registration with file upload
router.post('/register', uploadProfilePic, register);
router.post('/login', login);
router.get('/profile', authenticateToken, profile);
router.post('/logout', authenticateToken, logout);

router.put('/change-password', authenticateToken, changePassword);
router.put('/profile', authenticateToken, updateProfile);

// security Q/A + recovery
router.post('/security-question', getSecurityQuestion);
router.post('/recover-password', recoverPassword);
router.get('/security-questions', listSecurityQuestions);

// access code
router.post('/verify-access', verifyAccessCode);

export default router;

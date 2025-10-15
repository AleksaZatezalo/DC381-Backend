import fs from 'fs';
import { User } from '../models/User.js';
import { upload } from '../config/multer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getSetting } from '../services/settings.service.js';

// Multer middleware for profile picture
export const uploadProfilePic = upload.single('profilePicture');

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { username, password, tag, securityQuestion, securityAnswer } = req.body;

  if (!username || !password || !securityQuestion || !securityAnswer) {
    return res.status(400).json({
      message: 'Username, password, security question, and security answer are required'
    });
  }

  const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
  if (existingUser) return res.status(400).json({ message: 'Username already exists' });

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
  if (securityAnswer.trim().length < 1) {
    return res.status(400).json({ message: 'Security answer is required' });
  }

  const validQuestions = User.getSecurityQuestions();
  if (!validQuestions.includes(securityQuestion)) {
    return res.status(400).json({ message: 'Invalid security question' });
  }

  const userData = {
    username: username.trim(),
    password,
    tag: tag || '',
    securityQuestion,
    securityAnswer: securityAnswer.trim()
  };
  if (req.file) userData.profilePicture = `/uploads/${req.file.filename}`;

  try {
    const user = new User(userData);
    await user.save();

    const token = user.generateAuthToken();
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      message: user.isAdmin ? 'Admin account created successfully' : 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
        tag: user.tag,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        securityQuestion: user.securityQuestion
      }
    });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    throw error;
  }
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

  const user = await User.findOne({
    username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
    isActive: true
  });
  if (!user) return res.status(401).json({ message: 'Invalid username or password' });

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) return res.status(401).json({ message: 'Invalid username or password' });

  const token = user.generateAuthToken();
  user.lastLogin = new Date();
  await user.save();

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      tag: user.tag,
      isAdmin: user.isAdmin,
      lastLogin: user.lastLogin
    }
  });
});

// GET /api/auth/profile
export const profile = asyncHandler(async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      profilePicture: req.user.profilePicture,
      tag: req.user.tag,
      isAdmin: req.user.isAdmin,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
      securityQuestion: req.user.securityQuestion
    }
  });
});

// POST /api/auth/logout
export const logout = asyncHandler(async (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// PUT /api/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long' });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.json({ message: 'Password changed successfully' });
});

// PUT /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const { tag } = req.body;
  const allowedTags = [
    '', 'Crypto', 'OSCP', 'Networks', 'Web Apps', 'Forensics',
    'Malware Analysis', 'Social Engineering', 'Physical Security',
    'Mobile Security', 'Cloud Security', 'DevSecOps', 'Incident Response',
    'Threat Intelligence', 'Red Team', 'Blue Team', 'Purple Team'
  ];
  if (tag && !allowedTags.includes(tag)) {
    return res.status(400).json({ message: 'Invalid tag selected' });
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { tag: tag || '' },
    { new: true, runValidators: true }
  ).select('-password');

  if (!updatedUser) return res.status(404).json({ message: 'User not found' });

  res.json({
    message: 'Profile updated successfully',
    user: {
      id: updatedUser._id,
      username: updatedUser.username,
      profilePicture: updatedUser.profilePicture,
      tag: updatedUser.tag,
      isAdmin: updatedUser.isAdmin,
      createdAt: updatedUser.createdAt,
      lastLogin: updatedUser.lastLogin
    }
  });
});

// POST /api/auth/security-question
export const getSecurityQuestion = asyncHandler(async (req, res) => {
  const { username } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ message: 'Username is required' });
  }

  const user = await User.findOne({
    username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
    isActive: true
  }).select('username securityQuestion');

  if (!user) return res.status(404).json({ message: 'Username not found' });

  res.json({
    username: user.username,
    securityQuestion: user.securityQuestion
  });
});

// POST /api/auth/recover-password
export const recoverPassword = asyncHandler(async (req, res) => {
  const { username, securityAnswer, newPassword } = req.body;

  if (!username || !securityAnswer || !newPassword) {
    return res.status(400).json({
      message: 'Username, security answer, and new password are required'
    });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long' });
  }

  const user = await User.findOne({
    username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
    isActive: true
  });
  if (!user) return res.status(404).json({ message: 'Username not found' });

  const isAnswerValid = await user.compareSecurityAnswer(securityAnswer);
  if (!isAnswerValid) {
    return res.status(401).json({ message: 'Incorrect security answer' });
  }

  user.password = newPassword;
  await user.save();

  const token = user.generateAuthToken();
  user.lastLogin = new Date();
  await user.save();

  res.json({
    message: 'Password reset successful',
    token,
    user: {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      tag: user.tag,
      isAdmin: user.isAdmin,
      lastLogin: user.lastLogin,
      securityQuestion: user.securityQuestion
    }
  });
});

// GET /api/auth/security-questions
export const listSecurityQuestions = (_req, res) => {
  try {
    const questions = User.getSecurityQuestions();
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch security questions', error: error.message });
  }
};

// POST /api/auth/verify-access
export const verifyAccessCode = asyncHandler(async (req, res) => {
  const { accessCode } = req.body;

  if (!accessCode) return res.status(400).json({ message: 'Access code is required' });

  const currentAccessCode = await getSetting('ACCESS_CODE', '1337');

  if (accessCode === currentAccessCode) {
    return res.json({ message: 'Access code verified', valid: true });
  }

  res.status(401).json({ message: 'Invalid access code. Have you read all the philes?', valid: false });
});

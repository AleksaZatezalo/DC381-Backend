import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token  = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
};

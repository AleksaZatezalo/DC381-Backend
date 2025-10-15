import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const securityQuestions = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the name of your elementary school?',
  'What is your mother\'s maiden name?',
  'What was the make of your first car?',
  'What is the name of the street you grew up on?',
  'What was your favorite teacher\'s name?',
  'What is your favorite movie?',
  'What was the name of your first employer?',
  'What is your favorite book?'
];

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  password: { type: String, required: true, minlength: 6 },
  profilePicture: { type: String, default: null },
  tag: {
    type: String,
    enum: [
      '', 'Cryptography', 'Cryptocoins', 'OSCP', 'Networks', 'Web Apps', 'Forensics',
      'Malware Analysis', 'Social Engineering', 'Physical Security',
      'Mobile Security', 'Cloud Security', 'DevSecOps', 'Incident Response',
      'Threat Intelligence', 'Red Team', 'Blue Team', 'Purple Team'
    ],
    default: ''
  },
  securityQuestion: { type: String, required: true, enum: securityQuestions },
  securityAnswer: { type: String, required: true, minlength: 1 },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null },
  isActive: { type: Boolean, default: true }
});

// pre-save: hash password & security answer + first-user admin
userSchema.pre('save', async function(next) {
  try {
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
    if (this.isModified('securityAnswer')) {
      const salt = await bcrypt.genSalt(12);
      this.securityAnswer = await bcrypt.hash(this.securityAnswer.toLowerCase().trim(), salt);
    }
    if (this.isNew && !this.isAdmin) {
      const userCount = await this.constructor.countDocuments();
      if (userCount === 0) {
        this.isAdmin = true;
        console.log(`Making first user ${this.username} an admin`);
      }
    }
    next();
  } catch (e) { next(e); }
});

userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.compareSecurityAnswer = function(candidate) {
  return bcrypt.compare(candidate.toLowerCase().trim(), this.securityAnswer);
};

userSchema.methods.generateAuthToken = function() {
  const payload = { userId: this._id, username: this.username, isAdmin: this.isAdmin };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
};

userSchema.statics.getSecurityQuestions = () => securityQuestions;

export const User = mongoose.model('User', userSchema);

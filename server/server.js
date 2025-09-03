const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost', 'https://your-frontend-name.onrender.com');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dc381', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  profilePicture: {
    type: String,
    default: null
  },
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
  // NEW: Security question fields
  securityQuestion: {
    type: String,
    required: true,
    enum: [
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
    ]
  },
  securityAnswer: {
    type: String,
    required: true,
    minlength: 1
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// SINGLE pre-save middleware (replaces both previous ones)
userSchema.pre('save', async function(next) {
  // Handle password hashing
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }

  // Handle security answer hashing
  if (this.isModified('securityAnswer')) {
    try {
      const salt = await bcrypt.genSalt(12);
      this.securityAnswer = await bcrypt.hash(this.securityAnswer.toLowerCase().trim(), salt);
    } catch (error) {
      return next(error);
    }
  }

  // Make first user admin
  if (this.isNew && !this.isAdmin) {
    try {
      const userCount = await this.constructor.countDocuments();
      if (userCount === 0) {
        this.isAdmin = true;
        console.log(`Making first user ${this.username} an admin`);
      }
    } catch (error) {
      console.error('Error checking user count:', error);
    }
  }

  next();
});

userSchema.methods.compareSecurityAnswer = async function(candidateAnswer) {
  return bcrypt.compare(candidateAnswer.toLowerCase().trim(), this.securityAnswer);
};

// Add method to get available security questions (static method)
userSchema.statics.getSecurityQuestions = function() {
  return [
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
};

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token with admin status
userSchema.methods.generateAuthToken = function() {
  const payload = {
    userId: this._id,
    username: this.username,
    isAdmin: this.isAdmin
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d'
  });
};

const User = mongoose.model('User', userSchema);

// Settings Schema for configurable values
const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const Settings = mongoose.model('Settings', settingsSchema);

// Helper function to get a setting value
const getSetting = async (key, defaultValue = null) => {
  try {
    const setting = await Settings.findOne({ key });
    return setting ? setting.value : defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
};

// Helper function to set a setting value
const setSetting = async (key, value, description, updatedBy) => {
  try {
    return await Settings.findOneAndUpdate(
      { key },
      { value, description, updatedBy, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    throw error;
  }
};

// Initialize default settings
const initializeDefaultSettings = async () => {
  try {
    const accessCodeExists = await Settings.findOne({ key: 'ACCESS_CODE' });
    if (!accessCodeExists) {
      // Create a default admin user to associate with the initial setting
      const firstAdmin = await User.findOne({ isAdmin: true });
      if (firstAdmin) {
        await setSetting(
          'ACCESS_CODE',
          '1337',
          'Access code required for user registration',
          firstAdmin._id
        );
        console.log('Default access code setting created');
      }
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
  }
};

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Admin middleware
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: 'Authorization check failed' });
  }
};

// Forum Category Schema
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  icon: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Forum Topic Schema
const topicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  lastPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Forum Post Schema
const postSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create models
const Category = mongoose.model('Category', categorySchema);
const Topic = mongoose.model('Topic', topicSchema);
const Post = mongoose.model('Post', postSchema);

// Middleware to update topic activity
topicSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

postSchema.pre('save', async function(next) {
  if (this.isNew) {
    await Topic.findByIdAndUpdate(this.topic, {
      lastActivity: new Date(),
      lastPost: this._id
    });
  }
  next();
});

db.once('open', () => {
  console.log('Connected to MongoDB');
  initializeDefaultSettings();
});

// AUTHENTICATION ROUTES

// Register endpoint
app.post('/api/auth/register', upload.single('profilePicture'), async (req, res) => {
  try {
    const { username, password, tag, securityQuestion, securityAnswer } = req.body;
    
    if (!username || !password || !securityQuestion || !securityAnswer) {
      return res.status(400).json({
        message: 'Username, password, security question, and security answer are required'
      });
    }
    
    const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        message: 'Username already exists'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      });
    }

    if (securityAnswer.trim().length < 1) {
      return res.status(400).json({
        message: 'Security answer is required'
      });
    }

    // Validate security question is from allowed list
    const validQuestions = User.getSecurityQuestions();
    if (!validQuestions.includes(securityQuestion)) {
      return res.status(400).json({
        message: 'Invalid security question'
      });
    }
    
    const userData = {
      username: username.trim(),
      password,
      tag: tag || '',
      securityQuestion,
      securityAnswer: securityAnswer.trim()
    };
    
    if (req.file) {
      userData.profilePicture = `/uploads/${req.file.filename}`;
    }
    
    const user = new User(userData);
    await user.save();
    
    const token = user.generateAuthToken();
    
    user.lastLogin = new Date();
    await user.save();
    
    const userResponse = {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      tag: user.tag,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      securityQuestion: user.securityQuestion
    };
    
    res.status(201).json({
      message: user.isAdmin ? 
        'Admin account created successfully' : 
        'User registered successfully',
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Username already exists'
      });
    }
    
    res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
});

// NEW ENDPOINTS FOR PASSWORD RECOVERY

// Get security question for username
app.post('/api/auth/security-question', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || !username.trim()) {
      return res.status(400).json({
        message: 'Username is required'
      });
    }
    
    const user = await User.findOne({
      username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
      isActive: true
    }).select('username securityQuestion');
    
    if (!user) {
      return res.status(404).json({
        message: 'Username not found'
      });
    }
    
    res.json({
      username: user.username,
      securityQuestion: user.securityQuestion
    });
    
  } catch (error) {
    console.error('Security question fetch error:', error);
    res.status(500).json({
      message: 'Failed to fetch security question',
      error: error.message
    });
  }
});

// Verify security answer and reset password
app.post('/api/auth/recover-password', async (req, res) => {
  try {
    const { username, securityAnswer, newPassword } = req.body;
    
    if (!username || !securityAnswer || !newPassword) {
      return res.status(400).json({
        message: 'Username, security answer, and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password must be at least 6 characters long'
      });
    }
    
    const user = await User.findOne({
      username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
      isActive: true
    });
    
    if (!user) {
      return res.status(404).json({
        message: 'Username not found'
      });
    }
    
    const isAnswerValid = await user.compareSecurityAnswer(securityAnswer);
    if (!isAnswerValid) {
      return res.status(401).json({
        message: 'Incorrect security answer'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Generate new token and auto-login user
    const token = user.generateAuthToken();
    user.lastLogin = new Date();
    await user.save();
    
    const userResponse = {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      tag: user.tag,
      isAdmin: user.isAdmin,
      lastLogin: user.lastLogin,
      securityQuestion: user.securityQuestion
    };
    
    res.json({
      message: 'Password reset successful',
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Password recovery error:', error);
    res.status(500).json({
      message: 'Password recovery failed',
      error: error.message
    });
  }
});

// Get available security questions
app.get('/api/auth/security-questions', (req, res) => {
  try {
    const questions = User.getSecurityQuestions();
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching security questions:', error);
    res.status(500).json({
      message: 'Failed to fetch security questions',
      error: error.message
    });
  }
});

// Update security question and answer
app.put('/api/auth/security-question', authenticateToken, async (req, res) => {
  try {
    const { securityQuestion, securityAnswer } = req.body;
    
    if (!securityQuestion || !securityAnswer) {
      return res.status(400).json({
        message: 'Security question and answer are required'
      });
    }
    
    if (securityAnswer.trim().length < 1) {
      return res.status(400).json({
        message: 'Security answer cannot be empty'
      });
    }
    
    // Validate security question is from allowed list
    const validQuestions = User.getSecurityQuestions();
    if (!validQuestions.includes(securityQuestion)) {
      return res.status(400).json({
        message: 'Invalid security question'
      });
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.securityQuestion = securityQuestion;
    user.securityAnswer = securityAnswer.trim();
    await user.save();
    
    res.json({
      message: 'Security question updated successfully',
      securityQuestion: user.securityQuestion
    });
    
  } catch (error) {
    console.error('Security question update error:', error);
    res.status(500).json({
      message: 'Failed to update security question',
      error: error.message
    });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required'
      });
    }
    
    const user = await User.findOne({
      username: { $regex: new RegExp('^' + username.trim() + '$', 'i') },
      isActive: true
    });
    
    if (!user) {
      return res.status(401).json({
        message: 'Invalid username or password'
      });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid username or password'
      });
    }
    
    const token = user.generateAuthToken();
    
    user.lastLogin = new Date();
    await user.save();
    
    const userResponse = {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      tag: user.tag,
      isAdmin: user.isAdmin,
      lastLogin: user.lastLogin
    };
    
    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Login failed',
      error: error.message
    });
  }
});

// Get user profile endpoint
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const userResponse = {
      id: req.user._id,
      username: req.user.username,
      profilePicture: req.user.profilePicture,
      tag: req.user.tag,
      isAdmin: req.user.isAdmin,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
      securityQuestion: req.user.securityQuestion
    };
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Access code verification - UPDATED to use settings
app.post('/api/auth/verify-access', async (req, res) => {
  try {
    const { accessCode } = req.body;
    
    if (!accessCode) {
      return res.status(400).json({
        message: 'Access code is required'
      });
    }
    
    // Get the current access code from settings
    const currentAccessCode = await getSetting('ACCESS_CODE', '1337');
    
    if (accessCode === currentAccessCode) {
      res.json({
        message: 'Access code verified',
        valid: true
      });
    } else {
      res.status(401).json({
        message: 'Invalid access code. Have you read all the philes?',
        valid: false
      });
    }
  } catch (error) {
    console.error('Access code verification error:', error);
    res.status(500).json({
      message: 'Verification failed',
      error: error.message
    });
  }
});

// ADMIN ROUTES

// Admin dashboard
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments({ isActive: true });
    const adminCount = await User.countDocuments({ isActive: true, isAdmin: true });
    const categoryCount = await Category.countDocuments({ isActive: true });
    const topicCount = await Topic.countDocuments();
    const postCount = await Post.countDocuments();
    const eventCount = await Event.countDocuments();
    const publishedEventCount = await Event.countDocuments({ isPublished: true });
    
    const recentUsers = await User.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);
    
    const recentTopics = await Topic.find()
      .populate('author', 'username')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentEvents = await Event.find()
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      message: `Hello ${req.user.username}`,
      stats: {
        users: userCount,
        admins: adminCount,
        categories: categoryCount,
        topics: topicCount,
        posts: postCount,
        events: eventCount,
        publishedEvents: publishedEventCount
      },
      recentUsers: recentUsers.map(user => ({
        id: user._id,
        username: user.username,
        tag: user.tag,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
      })),
      recentTopics: recentTopics.map(topic => ({
        id: topic._id,
        title: topic.title,
        author: topic.author.username,
        category: topic.category.name,
        createdAt: topic.createdAt
      })),
      recentEvents: recentEvents.map(event => ({
        id: event._id,
        title: event.title,
        location: event.location,
        dateTime: event.dateTime,
        isPublished: event.isPublished,
        createdBy: event.createdBy.username,
        createdAt: event.createdAt
      }))
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Failed to load admin dashboard' });
  }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        tag: user.tag,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Admin: Toggle user admin status
app.put('/api/admin/users/:userId/toggle-admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true, isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          message: 'Cannot remove admin status from the last admin user' 
        });
      }
    }

    user.isAdmin = !user.isAdmin;
    await user.save();

    res.json({
      message: `User ${user.username} ${user.isAdmin ? 'granted' : 'revoked'} admin privileges`,
      user: {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ message: 'Failed to update admin status' });
  }
});

// Admin: Toggle user active status
app.put('/api/admin/users/:userId/toggle-active', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ 
        message: 'Cannot deactivate your own account' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: `User ${user.username} ${user.isActive ? 'activated' : 'deactivated'}`,
      user: {
        id: user._id,
        username: user.username,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

// SETTINGS API ROUTES

// Get all settings
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await Settings.find()
      .populate('updatedBy', 'username')
      .sort({ key: 1 });

    const settingsData = settings.map(setting => ({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedBy: setting.updatedBy.username,
      updatedAt: setting.updatedAt
    }));

    res.json({ settings: settingsData });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// Update a setting
app.put('/api/admin/settings/:key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (!value || !description) {
      return res.status(400).json({ 
        message: 'Value and description are required' 
      });
    }

    // Validate specific settings
    if (key === 'ACCESS_CODE') {
      if (value.length < 4) {
        return res.status(400).json({ 
          message: 'Access code must be at least 4 characters long' 
        });
      }
    }

    const setting = await setSetting(key, value, description, req.user._id);
    
    const populatedSetting = await Settings.findById(setting._id)
      .populate('updatedBy', 'username');

    res.json({
      message: `Setting '${key}' updated successfully`,
      setting: {
        key: populatedSetting.key,
        value: populatedSetting.value,
        description: populatedSetting.description,
        updatedBy: populatedSetting.updatedBy.username,
        updatedAt: populatedSetting.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ message: 'Failed to update setting' });
  }
});

// FORUM API ROUTES

// Get all categories with topic and post counts
app.get('/api/forum/categories', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ order: 1 });
    
    const categoriesWithStats = await Promise.all(
      categories.map(async (category) => {
        const topicCount = await Topic.countDocuments({ category: category._id });
        const postCount = await Post.countDocuments({
          topic: { $in: await Topic.find({ category: category._id }).distinct('_id') }
        });
        
        const latestTopic = await Topic.findOne({ category: category._id })
          .sort({ lastActivity: -1 })
          .populate('author', 'username')
          .populate('lastPost');
        
        let lastActivity = null;
        let lastUser = null;
        
        if (latestTopic) {
          lastActivity = latestTopic.lastActivity;
          if (latestTopic.lastPost) {
            const lastPost = await Post.findById(latestTopic.lastPost).populate('author', 'username');
            lastUser = lastPost ? lastPost.author.username : latestTopic.author.username;
          } else {
            lastUser = latestTopic.author.username;
          }
        }

        return {
          id: category._id,
          name: category.name,
          description: category.description,
          icon: category.icon,
          topicCount,
          postCount,
          lastActivity,
          lastUser
        };
      })
    );

    res.json({ categories: categoriesWithStats });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// Get topics in a category
app.get('/api/forum/categories/:categoryId/topics', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const topics = await Topic.find({ category: categoryId })
      .populate('author', 'username tag')
      .populate('lastPost')
      .sort({ isPinned: -1, lastActivity: -1 })
      .skip(skip)
      .limit(limit);

    const topicsWithStats = await Promise.all(
      topics.map(async (topic) => {
        const replyCount = await Post.countDocuments({ topic: topic._id });
        
        let lastUser = topic.author.username;
        let lastReply = topic.createdAt;
        
        if (topic.lastPost) {
          const lastPost = await Post.findById(topic.lastPost).populate('author', 'username');
          if (lastPost) {
            lastUser = lastPost.author.username;
            lastReply = lastPost.createdAt;
          }
        }

        return {
          id: topic._id,
          title: topic.title,
          author: topic.author.username,
          authorTag: topic.author.tag,
          replies: replyCount,
          views: topic.views,
          lastReply,
          lastUser,
          isPinned: topic.isPinned,
          isLocked: topic.isLocked,
          createdAt: topic.createdAt
        };
      })
    );

    const totalTopics = await Topic.countDocuments({ category: categoryId });
    const totalPages = Math.ceil(totalTopics / limit);

    res.json({
      topics: topicsWithStats,
      pagination: {
        currentPage: page,
        totalPages,
        totalTopics,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ message: 'Failed to fetch topics' });
  }
});

// Create new topic
app.post('/api/forum/categories/:categoryId/topics', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    if (title.length > 200) {
      return res.status(400).json({ message: 'Title must be 200 characters or less' });
    }

    if (content.length > 10000) {
      return res.status(400).json({ message: 'Content must be 10000 characters or less' });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const topic = new Topic({
      title,
      content,
      author: req.user._id,
      category: categoryId
    });

    await topic.save();

    const post = new Post({
      content,
      author: req.user._id,
      topic: topic._id
    });

    await post.save();

    topic.lastPost = post._id;
    await topic.save();

    const populatedTopic = await Topic.findById(topic._id)
      .populate('author', 'username tag');

    res.status(201).json({
      message: 'Topic created successfully',
      topic: {
        id: populatedTopic._id,
        title: populatedTopic.title,
        author: populatedTopic.author.username,
        authorTag: populatedTopic.author.tag,
        createdAt: populatedTopic.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ message: 'Failed to create topic' });
  }
});

// Get posts in a topic
app.get('/api/forum/topics/:topicId/posts', async (req, res) => {
  try {
    const { topicId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    await Topic.findByIdAndUpdate(topicId, { $inc: { views: 1 } });

    const topic = await Topic.findById(topicId)
      .populate('author', 'username tag')
      .populate('category', 'name');

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    const posts = await Post.find({ topic: topicId })
      .populate('author', 'username tag createdAt')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments({ topic: topicId });
    const totalPages = Math.ceil(totalPosts / limit);

    res.json({
      topic: {
        id: topic._id,
        title: topic.title,
        author: topic.author.username,
        authorTag: topic.author.tag,
        category: topic.category.name,
        views: topic.views,
        isPinned: topic.isPinned,
        isLocked: topic.isLocked,
        createdAt: topic.createdAt
      },
      posts: posts.map(post => ({
        id: post._id,
        content: post.content,
        author: post.author.username,
        authorTag: post.author.tag,
        isEdited: post.isEdited,
        editedAt: post.editedAt,
        createdAt: post.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Failed to fetch posts' });
  }
});

// Create new post (reply)
app.post('/api/forum/topics/:topicId/posts', authenticateToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    if (content.length > 10000) {
      return res.status(400).json({ message: 'Content must be 10000 characters or less' });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    if (topic.isLocked) {
      return res.status(403).json({ message: 'Topic is locked' });
    }

    const post = new Post({
      content: content.trim(),
      author: req.user._id,
      topic: topicId
    });

    await post.save();

    const populatedPost = await Post.findById(post._id)
      .populate('author', 'username tag');

    res.status(201).json({
      message: 'Post created successfully',
      post: {
        id: populatedPost._id,
        content: populatedPost.content,
        author: populatedPost.author.username,
        authorTag: populatedPost.author.tag,
        createdAt: populatedPost.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Failed to create post' });
  }
});

// Update post (edit)
app.put('/api/forum/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    if (content.length > 10000) {
      return res.status(400).json({ message: 'Content must be 10000 characters or less' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post (admins cannot edit other users' posts)
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own posts' });
    }

    post.content = content.trim();
    post.isEdited = true;
    post.editedAt = new Date();
    await post.save();

    res.json({
      message: 'Post updated successfully',
      post: {
        id: post._id,
        content: post.content,
        isEdited: post.isEdited,
        editedAt: post.editedAt
      }
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ message: 'Failed to update post' });
  }
});

// Delete post
app.delete('/api/forum/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post OR is admin
    const canDelete = post.author.toString() === req.user._id.toString() || req.user.isAdmin;
    if (!canDelete) {
      return res.status(403).json({ message: 'You can only delete your own posts' });
    }

    const topicId = post.topic;

    // Check if this is the original post (first post in topic)
    const firstPost = await Post.findOne({ topic: topicId }).sort({ createdAt: 1 });
    const isOriginalPost = firstPost && firstPost._id.toString() === postId;

    if (isOriginalPost) {
      // If deleting the original post, delete the entire topic
      await Post.deleteMany({ topic: topicId });
      await Topic.findByIdAndDelete(topicId);
      
      const actionBy = req.user.isAdmin && post.author.toString() !== req.user._id.toString() ? 
        'admin' : 'author';
      
      return res.json({ 
        message: `Original post deleted - entire topic removed${actionBy === 'admin' ? ' by admin' : ''}`,
        postId,
        topicDeleted: true,
        topicId,
        deletedBy: actionBy
      });
    }

    // Delete just this post
    await Post.findByIdAndDelete(postId);

    // Update topic's last post if necessary
    const remainingPosts = await Post.find({ topic: topicId }).sort({ createdAt: -1 });
    const topic = await Topic.findById(topicId);
    
    if (remainingPosts.length > 0) {
      topic.lastPost = remainingPosts[0]._id;
      topic.lastActivity = remainingPosts[0].createdAt;
    } else {
      topic.lastPost = null;
      topic.lastActivity = topic.createdAt;
    }
    
    await topic.save();

    const actionBy = req.user.isAdmin && post.author.toString() !== req.user._id.toString() ? 
      'admin' : 'author';

    res.json({ 
      message: `Post deleted successfully${actionBy === 'admin' ? ' by admin' : ''}`,
      postId,
      topicDeleted: false,
      deletedBy: actionBy
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: 'Failed to delete post' });
  }
});

// Delete topic (topic creator or admin can delete)
app.delete('/api/forum/topics/:topicId', authenticateToken, async (req, res) => {
  try {
    const { topicId } = req.params;

    const topic = await Topic.findById(topicId).populate('author');
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    // Check if user owns the topic OR is admin
    const canDelete = topic.author._id.toString() === req.user._id.toString() || req.user.isAdmin;
    if (!canDelete) {
      return res.status(403).json({ message: 'You can only delete your own topics' });
    }

    // Delete all posts in this topic first
    await Post.deleteMany({ topic: topicId });

    // Delete the topic
    await Topic.findByIdAndDelete(topicId);

    const actionBy = req.user.isAdmin && topic.author._id.toString() !== req.user._id.toString() ? 
      'admin' : 'author';

    res.json({ 
      message: `Topic and all its posts deleted successfully${actionBy === 'admin' ? ' by admin' : ''}`,
      topicId,
      deletedBy: actionBy
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ message: 'Failed to delete topic' });
  }
});

// Search topics and posts
app.get('/api/forum/search', async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 3) {
      return res.status(400).json({ message: 'Search query must be at least 3 characters' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const searchRegex = new RegExp(q.trim(), 'i');
    
    let topicFilter = {
      $or: [
        { title: searchRegex },
        { content: searchRegex }
      ]
    };
    
    if (category) {
      topicFilter.category = category;
    }

    const topics = await Topic.find(topicFilter)
      .populate('author', 'username tag')
      .populate('category', 'name')
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalResults = await Topic.countDocuments(topicFilter);
    const totalPages = Math.ceil(totalResults / parseInt(limit));

    res.json({
      results: topics.map(topic => ({
        id: topic._id,
        title: topic.title,
        author: topic.author.username,
        category: topic.category.name,
        lastActivity: topic.lastActivity,
        views: topic.views
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalResults,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      searchQuery: q.trim()
    });
  } catch (error) {
    console.error('Error searching forum:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

// Initialize default categories (run once)
app.post('/api/forum/init', async (req, res) => {
  try {
    const existingCategories = await Category.countDocuments();
    if (existingCategories > 0) {
      return res.json({ message: 'Categories already initialized' });
    }

    const defaultCategories = [
      {
        name: 'General Discussion',
        description: 'General cybersecurity topics and community discussions',
        icon: '💬',
        order: 1
      },
      {
        name: 'Vulnerability Research',
        description: 'Share your security research and vulnerability discoveries',
        icon: '🔍',
        order: 2
      },
      {
        name: 'CTF & Challenges',
        description: 'Capture The Flag discussions, writeups, and practice',
        icon: '🚩',
        order: 3
      },
      {
        name: 'Tools & Tutorials',
        description: 'Share security tools, scripts, and learning resources',
        icon: '🛠️',
        order: 4
      },
      {
        name: 'Job Board',
        description: 'Security job postings and career discussions',
        icon: '💼',
        order: 5
      },
      {
        name: 'Meetup Planning',
        description: 'Organize events, suggest topics, and coordinate meetups',
        icon: '📅',
        order: 6
      }
    ];

    await Category.insertMany(defaultCategories);
    
    res.status(201).json({ 
      message: 'Forum categories initialized successfully',
      categories: defaultCategories.length 
    });
  } catch (error) {
    console.error('Error initializing forum:', error);
    res.status(500).json({ message: 'Failed to initialize forum' });
  }
});

// Get all users (general endpoint)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ users });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password must be at least 6 characters long'
      });
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      message: 'Failed to change password',
      error: error.message
    });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
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
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userResponse = {
      id: updatedUser._id,
      username: updatedUser.username,
      profilePicture: updatedUser.profilePicture,
      tag: updatedUser.tag,
      isAdmin: updatedUser.isAdmin,
      createdAt: updatedUser.createdAt,
      lastLogin: updatedUser.lastLogin
    };
    
    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// Add this Events Schema after your existing schemas in server.js

// Events Schema
const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  dateTime: {
    type: Date,
    required: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on save
eventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Event = mongoose.model('Event', eventSchema);

// Add to your existing models section:
// const Event = mongoose.model('Event', eventSchema);

// PUBLIC EVENTS API ROUTES - Add these after your forum routes

// Get published events (public endpoint - no authentication required)
app.get('/api/events', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Only get published events that haven't passed yet (or include past events if needed)
    const events = await Event.find({ isPublished: true })
      .populate('createdBy', 'username')
      .sort({ dateTime: 1 }) // Sort by date, upcoming first
      .skip(skip)
      .limit(limit);

    const totalEvents = await Event.countDocuments({ isPublished: true });
    const totalPages = Math.ceil(totalEvents / limit);

    const eventsData = events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      dateTime: event.dateTime,
      createdBy: event.createdBy.username,
      createdAt: event.createdAt
    }));

    res.json({
      events: eventsData,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

// ADMIN EVENTS API ROUTES - Add these after your existing admin routes

// Admin: Get all events (including unpublished)
app.get('/api/admin/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const events = await Event.find()
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalEvents = await Event.countDocuments();
    const totalPages = Math.ceil(totalEvents / limit);

    const eventsData = events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      dateTime: event.dateTime,
      isPublished: event.isPublished,
      createdBy: event.createdBy.username,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    }));

    res.json({
      events: eventsData,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching admin events:', error);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

// Admin: Create new event
app.post('/api/admin/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, location, dateTime, isPublished } = req.body;

    if (!title || !description || !location || !dateTime) {
      return res.status(400).json({ 
        message: 'Title, description, location, and date/time are required' 
      });
    }

    if (title.length > 200) {
      return res.status(400).json({ 
        message: 'Title must be 200 characters or less' 
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({ 
        message: 'Description must be 2000 characters or less' 
      });
    }

    if (location.length > 200) {
      return res.status(400).json({ 
        message: 'Location must be 200 characters or less' 
      });
    }

    // Validate date
    const eventDate = new Date(dateTime);
    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({ 
        message: 'Invalid date/time format' 
      });
    }

    const event = new Event({
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      dateTime: eventDate,
      isPublished: Boolean(isPublished),
      createdBy: req.user._id
    });

    await event.save();

    const populatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username');

    res.status(201).json({
      message: 'Event created successfully',
      event: {
        id: populatedEvent._id,
        title: populatedEvent.title,
        description: populatedEvent.description,
        location: populatedEvent.location,
        dateTime: populatedEvent.dateTime,
        isPublished: populatedEvent.isPublished,
        createdBy: populatedEvent.createdBy.username,
        createdAt: populatedEvent.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ message: 'Failed to create event' });
  }
});

// Admin: Update event
app.put('/api/admin/events/:eventId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, description, location, dateTime, isPublished } = req.body;

    if (!title || !description || !location || !dateTime) {
      return res.status(400).json({ 
        message: 'Title, description, location, and date/time are required' 
      });
    }

    if (title.length > 200) {
      return res.status(400).json({ 
        message: 'Title must be 200 characters or less' 
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({ 
        message: 'Description must be 2000 characters or less' 
      });
    }

    if (location.length > 200) {
      return res.status(400).json({ 
        message: 'Location must be 200 characters or less' 
      });
    }

    // Validate date
    const eventDate = new Date(dateTime);
    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({ 
        message: 'Invalid date/time format' 
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    event.title = title.trim();
    event.description = description.trim();
    event.location = location.trim();
    event.dateTime = eventDate;
    event.isPublished = Boolean(isPublished);
    
    await event.save();

    const populatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username');

    res.json({
      message: 'Event updated successfully',
      event: {
        id: populatedEvent._id,
        title: populatedEvent.title,
        description: populatedEvent.description,
        location: populatedEvent.location,
        dateTime: populatedEvent.dateTime,
        isPublished: populatedEvent.isPublished,
        createdBy: populatedEvent.createdBy.username,
        updatedAt: populatedEvent.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ message: 'Failed to update event' });
  }
});

// Admin: Delete event
app.delete('/api/admin/events/:eventId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await Event.findByIdAndDelete(eventId);

    res.json({
      message: 'Event deleted successfully',
      eventId
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ message: 'Failed to delete event' });
  }
});

// Admin: Toggle event published status
app.put('/api/admin/events/:eventId/toggle-published', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    event.isPublished = !event.isPublished;
    await event.save();

    res.json({
      message: `Event ${event.isPublished ? 'published' : 'unpublished'} successfully`,
      event: {
        id: event._id,
        title: event.title,
        isPublished: event.isPublished
      }
    });
  } catch (error) {
    console.error('Error toggling event status:', error);
    res.status(500).json({ message: 'Failed to toggle event status' });
  }
});


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    message: 'DC381 API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`DC381 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/dc381'}`);
});
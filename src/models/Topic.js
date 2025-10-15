import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 10000 },

  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  isPinned: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },

  views: { type: Number, default: 0 },

  lastActivity: { type: Date, default: Date.now },
  lastPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },

  createdAt: { type: Date, default: Date.now }
});

// Keep activity fresh on any save
topicSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

// Indexes to support listing and filtering
topicSchema.index({ category: 1, isPinned: -1, lastActivity: -1 });
topicSchema.index({ createdAt: -1 });
topicSchema.index({ title: 'text', content: 'text' }); // for text search (optional)

export const Topic = mongoose.model('Topic', topicSchema);

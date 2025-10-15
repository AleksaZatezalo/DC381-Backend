import mongoose from 'mongoose';
import { Topic } from './Topic.js';

const postSchema = new mongoose.Schema({
  content: { type: String, required: true, maxlength: 10000 },

  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },

  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

// When a new post is created, bump the topic's activity & lastPost
postSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      await Topic.findByIdAndUpdate(this.topic, {
        lastActivity: new Date(),
        lastPost: this._id
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Indexes for fetching posts in a topic chronologically
postSchema.index({ topic: 1, createdAt: 1 });
postSchema.index({ author: 1, createdAt: -1 });

export const Post = mongoose.model('Post', postSchema);

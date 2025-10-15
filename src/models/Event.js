import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 2000 },
  location: { type: String, required: true, trim: true, maxlength: 200 },

  dateTime: { type: Date, required: true },
  isPublished: { type: Boolean, default: false },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Keep updatedAt fresh
eventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes to support public lists and admin tables
eventSchema.index({ isPublished: 1, dateTime: 1 });
eventSchema.index({ createdAt: -1 });

export const Event = mongoose.model('Event', eventSchema);

import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 500 },
  icon: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Helpful indexes for lists
categorySchema.index({ isActive: 1, order: 1 });

export const Category = mongoose.model('Category', categorySchema);

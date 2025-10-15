import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: String, required: true },
  description: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedAt: { type: Date, default: Date.now }
});

export const Settings = mongoose.model('Settings', settingsSchema);
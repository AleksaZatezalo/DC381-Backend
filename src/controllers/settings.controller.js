import { Settings } from '../models/Settings.js';
import { setSetting } from '../services/settings.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/admin/settings
export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.find().populate('updatedBy', 'username').sort({ key: 1 });
  const data = settings.map(s => ({
    key: s.key,
    value: s.value,
    description: s.description,
    updatedBy: s.updatedBy.username,
    updatedAt: s.updatedAt
  }));
  res.json({ settings: data });
});

// PUT /api/admin/settings/:key
export const updateSetting = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value, description } = req.body;

  if (!value || !description) {
    return res.status(400).json({ message: 'Value and description are required' });
  }
  if (key === 'ACCESS_CODE' && value.length < 4) {
    return res.status(400).json({ message: 'Access code must be at least 4 characters long' });
  }

  const setting = await setSetting(key, value, description, req.user._id);
  const populated = await Settings.findById(setting._id).populate('updatedBy', 'username');

  res.json({
    message: `Setting '${key}' updated successfully`,
    setting: {
      key: populated.key,
      value: populated.value,
      description: populated.description,
      updatedBy: populated.updatedBy.username,
      updatedAt: populated.updatedAt
    }
  });
});

import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';

export const getSetting = async (key, defaultValue = null) => {
  try {
    const s = await Settings.findOne({ key });
    return s ? s.value : defaultValue;
  } catch (e) {
    console.error(`Error getting setting ${key}:`, e);
    return defaultValue;
  }
};

export const setSetting = async (key, value, description, updatedBy) => {
  try {
    return await Settings.findOneAndUpdate(
      { key },
      { value, description, updatedBy, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error(`Error setting ${key}:`, e);
    throw e;
  }
};

export const initializeDefaultSettings = async () => {
  try {
    const exists = await Settings.findOne({ key: 'ACCESS_CODE' });
    if (!exists) {
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
  } catch (e) {
    console.error('Error initializing default settings:', e);
  }
};

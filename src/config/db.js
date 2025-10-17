import mongoose from 'mongoose';
import { config } from './env.js';

mongoose.connect(config.mongoUri, {
  dbName: "dc381",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', (e) => console.error('MongoDB connection error:', e));
db.once('open', () => console.log('Connected to MongoDB'));

export default db;

import { createServer } from 'http';
import app from './app.js';
import { config } from './config/env.js';
import './config/db.js'; // init DB connection

const server = createServer(app);

server.listen(config.port, () => {
  console.log(`DC381 Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`MongoDB URI: ${config.mongoUriShown}`);
});
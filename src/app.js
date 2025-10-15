// optional: add helmet so it accepts https only
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import routes from './routes/index.js';
import { corsOptions } from './config/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { config } from './config/env.js';

const app = express();

// app setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

// uploads static folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// health check
app.get('/api/health', (req, res) => {
  res.json({
    message: 'DC381 API is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// routes
app.use('/api', routes);

// 404 + error
app.use('*', notFound);
app.use(errorHandler);

export default app;

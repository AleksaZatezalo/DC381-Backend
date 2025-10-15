import { config } from './env.js';

export const corsOptions = {
  origin: config.allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin','X-Requested-With','Content-Type','Accept','Authorization'],
  optionsSuccessStatus: 200,
};

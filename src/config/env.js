import 'dotenv/config';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dc381';
const JWT_SECRET = process.env.JWT_SECRET || '';
// app should crash if there is no jwt signing key
if(!JWT_SECRET) {
    throw Error('JWT_SECRET is not defined');
};
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://dc381.org';

export const config = {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: MONGODB_URI,
  mongoUriShown: MONGODB_URI,
  jwtSecret: JWT_SECRET,
  allowedOrigin: ALLOWED_ORIGIN,
};

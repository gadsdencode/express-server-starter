import express, { Request, Response } from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
// import { Server as WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
// import { createClient } from '@supabase/supabase-js';
// import { body, validationResult } from 'express-validator';
// import crypto from 'crypto';
import winston from 'winston';
// import fetch from 'node-fetch';
import { OAuth2Client } from 'google-auth-library';
// import { createClient, SupabaseClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;
/*
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
*/
const oAuth2Client = new OAuth2Client(
  clientId,
  clientSecret,
  'postmessage'
);
/*
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
*/


const app = express();
const server = http.createServer(app);

// CORS setup
const allowedOrigins = ['http://localhost:3000']; // Add additional domains as needed comma separated ['https://domain1.com','https://domain2.com']
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Middleware setup
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/vnd.custom-type' }));
app.use(express.text({ type: 'text/html' }));

// Winston Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'rejections.log' })
  ]
});
/*
if (!supabaseUrl || !supabaseKey) {
  logger.error('Supabase URL and Key must be set in environment variables.');
  process.exit(1);
}
*/

app.post('/auth/google', async (req: Request, res: Response) => {
  const { tokens } = await oAuth2Client.getToken(req.body.code);
  console.log(tokens);

  res.json(tokens);
});

app.post('/auth/google/refresh-token', async (req: Request, res: Response) => {
  const user = new OAuth2Client(
    clientId,
    clientSecret
  );
  user.setCredentials({
    refresh_token: req.body.refreshToken
  });
  const { credentials } = await user.refreshAccessToken();
  res.json(credentials);
});


const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'hello world' });
});

app.use('/api/v1', api);

const port = process.env.PORT || 3333;
server.listen(port, () => {
  console.log(`Server started on port ${port}`);
  logger.info(`Server started on port ${port}`);
});
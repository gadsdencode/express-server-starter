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
import { google } from 'googleapis';

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

export const createGoogleCalendarClient = () => {
  return google.calendar({
    version: 'v3',
    auth: oAuth2Client,
  });
};
/*
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
*/


export const app = express();
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

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

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

const api = express.Router();

api.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const { tokens } = await oAuth2Client.getToken(req.body.code);
    logger.info(`Access tokens retrieved: ${JSON.stringify(tokens)}`);
    res.json(tokens);
  } catch (error) {
    logger.error(`Error retrieving tokens: ${error}`);
    res.status(500).send('Failed to retrieve tokens');
  }
});

api.post('/auth/google/refresh-token', async (req: Request, res: Response) => {
  try {
    const user = new OAuth2Client(clientId, clientSecret);
    user.setCredentials({ refresh_token: req.body.refreshToken });
    const { credentials } = await user.refreshAccessToken();
    logger.info(`Refresh token used successfully for clientId: ${clientId}`);
    res.json(credentials);
  } catch (error) {
    logger.error(`Error refreshing access token: ${error}`);
    res.status(500).send('Failed to refresh access token');
  }
});

api.get('/calendarevents', async (req: Request, res: Response) => {
  try {
    const googleCalendarClient = createGoogleCalendarClient();
    const events = await googleCalendarClient.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(events.data.items);
  } catch (error) {
    console.error('Error retrieving events:', error);
    const message = (error as { message: string }).message || 'Failed to fetch events';
    res.status(500).json({ message });
  }
});

api.get('/hello', (req, res) => {
  logger.info('Hello world endpoint called');
  res.status(200).send({ message: 'hello world' });
});

app.use('/api/v1', api);

const port = process.env.PORT || 3333;
server.listen(port, () => {
  logger.info(`Server started on port ${port}`);
});
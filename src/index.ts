import express, { Request, Response } from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
// import { Server as WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
// import { createClient } from '@supabase/supabase-js';
// import { body, validationResult } from 'express-validator';
// import crypto from 'crypto';
import { config } from 'dotenv';
import winston from 'winston';
// import fetch from 'node-fetch';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createClient, SupabaseClient  } from '@supabase/supabase-js';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  googleRedirectUri
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

config(); // Loads environment variables from .env file

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

if (!supabaseUrl || !supabaseKey) {
  logger.error('Supabase URL and Key must be set in environment variables.');
  process.exit(1);
}

async function refreshAccessToken(refreshToken: string) {
  const oAuth2Client = new OAuth2Client(googleClientId);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oAuth2Client.refreshAccessToken();
  const { access_token: accessToken, expiry_date: expiryDate } = credentials;

  // Update the access token and expiry date in the database
  await supabase
    .from('google_auth')
    .update({ access_token: accessToken, expiry_date: expiryDate })
    .eq('refresh_token', refreshToken);
  return { access_token: 'newAccessToken' };
}

app.use(async (req, res, next) => {
  const accessToken = req.cookies['access_token'];
  const refreshToken = req.cookies['refresh_token'];
  logger.info(`Handling ${req.method} request for ${req.url}`);
  if (!accessToken) {
    if (refreshToken) {
      // Attempt to refresh the token here
      try {
        const newTokens = await refreshAccessToken(refreshToken);
        res.cookie('access_token', newTokens.access_token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600000 });
        req.cookies['access_token'] = newTokens.access_token;  // Set new access token for the current request
        next();
      } catch (error) {
        res.status(401).send('Unauthorized: Unable to refresh token');
      }
    } else {
      res.status(401).send('Unauthorized: No access token provided');
    }
  } else {
    next();  // Token is valid, proceed to the next middleware
  }
});

app.get('/', (req, res) => {
  logger.info('Healthcheck endpoint was hit');
  res.status(200).send({ status: 'ok' });
});

app.get('/auth/google', (req: Request, res: Response) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',
    'openid'
  ];

  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Invalid request: no code provided');
  }
    try {
      const { tokens } = await oAuth2Client.getToken(code.toString());
      oAuth2Client.setCredentials(tokens);

      const userInfoResponse = await google.oauth2('v2').userinfo.get({ auth: oAuth2Client });
      await updateCredentialsInDatabase(userInfoResponse.data.email, userInfoResponse.data.id, tokens);
      res.cookie('access_token', tokens.access_token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600000 });
      res.cookie('refresh_token', tokens.refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400000 });
      res.redirect('/success');
      } catch (error) {
      console.error('Error during OAuth2 callback:', error);
      res.redirect('/error');
  }
});

// Server code
app.get('/api/v1/calendarevents', async (req, res) => {
  const { email } = req.query;
  try {
    const { data, error } = await supabase
      .from('google_auth')
      .select('access_token')
      .eq('email', email)
      .single();

    if (error) {
      throw new Error('Failed to retrieve access token from database');
    }

    const { access_token } = data;
    oAuth2Client.setCredentials({ access_token });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.status(200).json(events.data.items);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
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

async function updateCredentialsInDatabase(email: string, googleId: string, tokens: any) {
  const { error } = await supabase
    .from('google_auth')
    .upsert({
      email,
      google_id: googleId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

  if (error) {
    console.error('Failed to insert tokens into database:', error.message);
    throw error;
  }
}
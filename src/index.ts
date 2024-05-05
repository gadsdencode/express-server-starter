import express, { Request, Response } from 'express';
import http from 'http';
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

app.use((req, res, next) => {
  logger.info(`Handling ${req.method} request for ${req.url}`);
  next();
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

app.get('/oauth2callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  if (code) {
    try {
      const { tokens } = await oAuth2Client.getToken(code as string);
      oAuth2Client.setCredentials(tokens);

      const userInfoResponse = await google.oauth2('v2').userinfo.get({ auth: oAuth2Client });
      const email = userInfoResponse.data.email;
      const googleId = userInfoResponse.data.id;

      // Save tokens to the database
      await updateCredentialsInDatabase(email, googleId, tokens);
      

oAuth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    // Store the refresh_token and access_token in your database
    updateRefreshToken(tokens.refresh_token, tokens.access_token, email);
  }
});

res.redirect('/success'); // Redirect to a success page
    } catch (error) {
      console.error('Error processing OAuth2 callback:', error);
      res.redirect('/error'); // Redirect to an error page
    }
  } else {
    res.status(400).send('Invalid request: no code provided');
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

async function updateRefreshToken(refreshToken: string, accessToken: string, email: string) {
  // Assume that you have the user's email or a unique identifier to update the correct record
  // Here, you would have to fetch that data or have it stored locally
  const { error } = await supabase
    .from('google_auth')
    .update({
      refresh_token: refreshToken,
      access_token: accessToken
    })
    .match({ email: email });

  if (error) {
    console.error('Failed to update refresh token in database:', error.message);
  } else {
    console.log('Refresh token updated successfully in database.');
  }
}
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
import axios from 'axios';

dotenv.config();

const linkedin_redirect_uri = process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI;
const linkedin_client_id = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
const linkedin_client_secret = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_SECRET;

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
const allowedOrigins = ['http://localhost:3000', 'https://kainbridge-mvp.vercel.app', 'https://kainbridge-mvp-gadsdencode-pro.vercel.app']; // Add additional domains as needed comma separated ['https://domain1.com','https://domain2.com']
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
//API Endpoints
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
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      throw new Error('Access token is missing');
    }

    oAuth2Client.setCredentials({ access_token: accessToken });

    const googleCalendarClient = createGoogleCalendarClient();
    const events = await googleCalendarClient.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      showDeleted: false,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(events.data.items);
  } catch (error) {
    logger.error('Error retrieving events:', error);
    const message = (error as { message: string }).message || 'Failed to fetch events';
    res.status(500).json({ message });
  }
});

api.get('/userinfo', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
    const userInfo = await fetchUserInfo(accessToken);
    res.json(userInfo);
  } catch (error: any) {
    logger.error(`Error fetching user information: ${error.message}`);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

api.get('/user/profile', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {
      logger.error('Access token is missing');
      return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
      const userInfo = await fetchUserInfo(accessToken);
      // Assuming fetchUserInfo returns the user data in the desired format
      res.json({
          name: userInfo.user.name,
          email: userInfo.user.email,
          picture: userInfo.user.picture
      });
  } catch (error: any) {
      logger.error(`Error fetching user profile: ${error.message}`);
      res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

api.post('/auth/linkedin', async (req: Request, res: Response) => {
  try {
      const { code } = req.body;
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: linkedin_redirect_uri,
          client_id: linkedin_client_id,
          client_secret: linkedin_client_secret
      });
      const { access_token } = tokenResponse.data;
      logger.info(`Access tokens retrieved: ${JSON.stringify(tokenResponse.data)}`);
      res.json({ access_token });
  } catch (error) {
      logger.error('LinkedIn token retrieval failed:', error);
      res.status(500).json({ message: 'Failed to retrieve LinkedIn tokens' });
  }
});

api.get('/linkedin/userinfo', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];  // Extract the access token from the Authorization header

  if (!accessToken) {
      logger.error('Access token is missing');
      return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
      // Fetch user information from LinkedIn
      const userInfoResponse = await axios.get('https://api.linkedin.com/v2/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
              projection: '(id,firstName,lastName,profilePicture(displayImage~:playableStreams))'
          }
      });

      // Extract necessary fields from LinkedIn response
      const { email, firstName, lastName, profilePicture } = userInfoResponse.data;
      const userProfile = {
          name: `${firstName.localized.en_US} ${lastName.localized.en_US}`,
          picture: profilePicture['displayImage~'].elements[0].identifiers[0].identifier,
          email: email
      };

      // Send the user profile information as JSON
      res.json(userProfile);
  } catch (error: any) {
      logger.error('Error fetching LinkedIn user information:', error);
      res.status(500).json({ message: 'Failed to fetch LinkedIn user details', error: error.response?.data || error.message });
  }
});

//Async Functions
async function fetchUserInfo(accessToken: string) {
  const response = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.data) throw new Error('Failed to fetch user details');
  return {
    access_token: accessToken,
    refresh_token: null, // Refresh token should be handled securely server-side if used
    user: {
      name: response.data.name,
      email: response.data.email,
      picture: response.data.picture
    }
  };
}


api.get('/hello', (req, res) => {
  logger.info('Hello world endpoint called');
  res.status(200).send({ message: 'hello world' });
});

app.use('/api/v1', api);

const port = process.env.PORT || 3333;
server.listen(port, () => {
  logger.info(`Server started on port ${port}`);
});
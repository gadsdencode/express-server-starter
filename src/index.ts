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
import qs from 'querystring';

dotenv.config();

const LINKEDIN_TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/v2/accessToken';
const REDIRECT_URI = process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI || 'http://localhost';
const CLIENT_ID = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_SECRET;

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


export const app = express();
const server = http.createServer(app);


const allowedOrigins = ['http://localhost:3000', 'https://kainbridge-mvp.vercel.app', 'https://kainbridge-mvp-gadsdencode-pro.vercel.app']; // Add additional domains as needed comma separated ['https://domain1.com','https://domain2.com']
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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


app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/vnd.custom-type' }));
app.use(express.text({ type: 'text/html' }));


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
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    logger.info('Access tokens retrieved:', tokens);
    res.json(tokens);
  } catch (error) {
    logger.error('Error retrieving tokens:', error);
    res.status(500).json({ message: 'Failed to retrieve tokens', error: error.toString() });
  }
});

api.post('/auth/google/refresh-token', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    const user = new OAuth2Client(clientId, clientSecret);
    user.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await user.refreshAccessToken();
    logger.info('Refresh token used successfully:', credentials);
    res.json(credentials);
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    res.status(500).json({ message: 'Failed to refresh access token', error: error.toString() });
  }
});


api.get('/calendarevents', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Access token is required' });
  }

  try {
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
    res.status(500).json({ message: 'Failed to fetch events', error: error.toString() });
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
  const { code } = req.body;
  if (!code) {
    logger.error('Authorization code not provided');
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    const params = qs.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const tokenResponse = await axios.post(LINKEDIN_TOKEN_ENDPOINT, params, {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token } = tokenResponse.data;
    logger.info('LinkedIn access token successfully retrieved', { access_token });
    res.json({ access_token });
  } catch (error: any) {
    logger.error('Failed to retrieve LinkedIn access token', {
      error: error.response?.data || error.message,
      requestDetails: {
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID
      }
    });
    res.status(500).json({
      message: 'Failed to retrieve LinkedIn tokens',
      details: error.response?.data || error.message
    });
  }
});

api.post('/auth/linkedin/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    const params = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const tokenResponse = await axios.post(LINKEDIN_TOKEN_ENDPOINT, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;
    logger.info('LinkedIn access token refreshed successfully', { access_token });
    res.json({ access_token });
  } catch (error: any) {
    logger.error('Failed to refresh LinkedIn access token', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      message: 'Failed to refresh LinkedIn access token',
      details: error.response?.data || error.message
    });
  }
});

api.get('/linkedin/userinfo', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {
    logger.error('Access token is missing for LinkedIn userinfo request');
    return res.status(401).json({ error: 'Access token is required' });
  }

  try {
    const profileResponse = await axios.get(`https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams),locale)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const emailResponse = await axios.get('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const profileData = {
      name: `${profileResponse.data.firstName.localized.en_US} ${profileResponse.data.lastName.localized.en_US}`,
      email: emailResponse.data.elements[0]['handle~'].emailAddress,
      picture: profileResponse.data.profilePicture['displayImage~'].elements[0].identifiers[0].identifier,
      locale: profileResponse.data.locale
    };

    res.json(profileData);
  } catch (error: any) {
      logger.error('Error fetching LinkedIn user information', {
        message: error.message,
        response: error.response?.data,
        headers: req.headers
      });
      res.status(500).json({ message: 'Failed to fetch user details', error: error.message });
    }
});

api.post('/linkedin-token', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    logger.error('Authorization code not provided');
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    const params = qs.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const response = await axios.post(LINKEDIN_TOKEN_ENDPOINT, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    res.json({
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in
    });
  } catch (error: any) {
    logger.error('Failed to exchange authorization code for access token', {
      details: error.response?.data || error.message
    });
    res.status(500).json({
      message: 'Failed to exchange authorization code for access token',
      error: error.response?.data || error.message
    });
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
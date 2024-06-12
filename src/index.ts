import express, { Request, Response } from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
// import { Server as WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
//import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import { body, validationResult } from 'express-validator';
// import crypto from 'crypto';
import winston from 'winston';
// import fetch from 'node-fetch';
import { OAuth2Client } from 'google-auth-library';
import { createClient, SupabaseClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import axios from 'axios';

import { getLinkedInData, getLinkedInAccessToken } from './server/linkedin';

interface UpdateData {
  status: string;
  proposed_time?: string; // Make proposed_time optional since it's conditionally added
  proposed_date?: string;
  requester_id?: string;
  user_id?: string;
  event_data?: string;
  accepted?: boolean;
  declined?: boolean;
}

interface RoomResponse {
  url: string;
  error?: { message: string };
}

dotenv.config();

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

logger.info('Set oAuth2Client:', oAuth2Client);

export const createGoogleCalendarClient = () => {
  logger.info('Creating Google Calendar client');
  return google.calendar({
    version: 'v3',
    auth: oAuth2Client,
  });
};

logger.info('Created Google Calendar client:', createGoogleCalendarClient());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
logger.info('Created Supabase client:', supabase);


const redirectUri = process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI;

export const app = express();
const server = http.createServer(app);

// CORS setup
const allowedOrigins = ['http://localhost:3000', 'https://kainbridge-mvp.vercel.app', 'https://kainbridge-mvp-gadsdencode-pro.vercel.app/ai', 'https://kainbridge-mvp-gadsdencode-pro.vercel.app']; // Add additional domains as needed comma separated ['https://domain1.com','https://domain2.com']
logger.info('Allowed origins:', allowedOrigins);
app.use(cors({
  origin: (origin, callback) => {
    logger.info('Received request from origin:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      logger.info('Origin is allowed:', origin);
      callback(null, true);
    } else {
      logger.info('Origin is not allowed:', origin);
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

/*
if (!supabaseUrl || !supabaseKey) {
  logger.error('Supabase URL and Key must be set in environment variables.');
  process.exit(1);
}
*/

const api = express.Router();

// Google APIs
api.post('/auth/google', async (req: Request, res: Response) => {
  logger.info('Received request to fetch Google access tokens');
  try {
    const { tokens } = await oAuth2Client.getToken(req.body.code);
    logger.info(`Access tokens retrieved: ${JSON.stringify(tokens)}`);
    res.json(tokens);
    logger.info('Returned access tokens:', tokens);
  } catch (error) {
    logger.error(`Error retrieving tokens: ${error}`);
    res.status(500).send('Failed to retrieve tokens');
  }
});

api.post('/auth/google/refresh-token', async (req: Request, res: Response) => {
  logger.info('Received request to refresh access token');
  try {
    const user = new OAuth2Client(clientId, clientSecret);
    logger.info('Set user:', user);
    user.setCredentials({ refresh_token: req.body.refreshToken });
    logger.info('Set credentials:', { refresh_token: req.body.refreshToken });
    const { credentials } = await user.refreshAccessToken();
    logger.info('Refreshed access token:', credentials);
    logger.info(`Refresh token used successfully for clientId: ${clientId}`);
    res.json(credentials);
  } catch (error) {
    logger.error(`Error refreshing access token: ${error}`);
    res.status(500).send('Failed to refresh access token');
  }
});

api.get('/calendarevents', async (req: Request, res: Response) => {
  logger.info('Received request to fetch calendar events');
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    logger.info('Received access token:', accessToken);
    if (!accessToken) {
      throw new Error('Access token is missing');
    }

    oAuth2Client.setCredentials({ access_token: accessToken });
    logger.info('Set access token:', accessToken);

    const googleCalendarClient = createGoogleCalendarClient();
    const events = await googleCalendarClient.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      showDeleted: false,
      singleEvents: true,
      orderBy: 'startTime',
    });

    logger.info('Fetched events:', events.data.items);
    res.json(events.data.items);
  } catch (error) {
    logger.error('Error retrieving events:', error);
    const message = (error as { message: string }).message || 'Failed to fetch events';
    res.status(500).json({ message });
  }
});

api.post('/calendarevents', async (req: Request, res: Response) => {
  logger.info('Received request to create a calendar event');
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    logger.info('Received access token:', accessToken);
    if (!accessToken) {
      throw new Error('Access token is missing');
    }

    oAuth2Client.setCredentials({ access_token: accessToken });
    logger.info('Set access token:', accessToken);

    const googleCalendarClient = createGoogleCalendarClient();
    const event = req.body;
    logger.info('Event data:', event);

    const response = await googleCalendarClient.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.start.dateTime,
        },
        end: {
          dateTime: event.end.dateTime,
        },
      },
    });

    logger.info('Event created:', response.data);
    res.status(201).json(response.data);
  } catch (error) {
    logger.error('Error creating event:', error);
    const message = (error as { message: string }).message || 'Failed to create event';
    res.status(500).json({ message });
  }
});

api.post('/appointment-requests', async (req, res) => {
  logger.info('Received request to create an appointment request');
  try {
    const { userEmail, requesterId, eventData } = req.body;

    const { data, error } = await supabase
      .from('appointment_requests')
      .insert([{ user_id: userEmail, requester_id: requesterId, event_data: eventData }]);

    if (error) {
      throw new Error(error.message);
    }

    logger.info('Appointment request created:', data);
    res.status(201).json(data);
  } catch (error: any) {
    logger.error('Error creating appointment request:', error);
    res.status(500).json({ message: error.message || 'Failed to create appointment request' });
  }
});

api.post('/appointment-requests/:email/respond', async (req, res) => {
  logger.info('Received request to respond to an appointment request');
  try {
    const { email } = req.params;
    const { action, proposedTime, proposedDate } = req.body;

    if (!action) {
      throw new Error('Action is missing');
    }

    let updateData: UpdateData = { status: action };

    if (action === 'propose') {
      if (!proposedTime) {
        throw new Error('Proposed time is missing');
      }
      updateData = { ...updateData, proposed_time: proposedTime, proposed_date: proposedDate };
    }

    const { data, error } = await supabase
    .from('appointment_requests')
    .update({ updateData })
    .eq('user_id', email) as { data: any | null, error: Error | null };

  if (error) {
    throw new Error(error.message);
  }

  logger.info('Appointment request response updated:', data);

  if (action === 'accept' && data && data.length > 0) {
      const request = data[0];
      await supabase
        .from('appointments')
        .insert([{ user_id: request.user_email, event_data: request.event_data }]);
    }

    if (action === 'decline' && data && data.length > 0) {
      const request = data[0];
      await supabase
        .from('appointments')
        .insert([{ user_id: request.user_email, event_data: request.event_data }]);
    }

    res.status(200).json(data);
  } catch (error: any) {
    logger.error('Error responding to appointment request:', error);
    res.status(500).json({ message: error.message || 'Failed to respond to appointment request' });
  }
});

api.get('/appointments', async (req, res) => {
  logger.info('Received request to fetch appointments');
  try {
    const { userEmail } = req.query;

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', userEmail);

    if (error) {
      throw new Error(error.message);
    }

    logger.info('Fetched appointments:', data);
    res.status(200).json(data);
  } catch (error: any) {
    logger.error('Error fetching appointments:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch appointments' });
  }
});

api.get('/userinfo', async (req: Request, res: Response) => {
  logger.info('Received request to fetch user information');
  const accessToken = req.headers.authorization?.split(' ')[1];
  logger.info('Received access token:', accessToken);
  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
    const userInfo = await fetchUserInfo(accessToken);
    console.log('User info retrieved in /userinfo endpoint:', userInfo);
    logger.info('Fetched user information:', userInfo);
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
      logger.info('Fetched user profile:', userInfo);
      console.log('User info retrieved in /user/profile endpoint:', userInfo);
      res.json({
          name: userInfo.user.name,
          email: userInfo.user.email,
          picture: userInfo.user.picture
      });
      logger.info('Returned user profile:', userInfo);
  } catch (error: any) {
      logger.error(`Error fetching user profile: ${error.message}`);
      res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

// LinkedIn APIs
api.post('/linkedin/exchange-token', async (req: Request, res: Response) => {
  logger.info('Received request to exchange code for access token');
  const { code, redirectUri } = req.body;
  logger.info('Received code and redirect URI:', { code, redirectUri });
  if (!code || !redirectUri) {
    logger.error('Authorization code and redirect URI are required');
    return res.status(400).json({ message: 'Authorization code and redirect URI are required' });
  }

  try {
    const accessToken = await getLinkedInAccessToken(code, redirectUri);
    logger.info('Exchanged code for access token:', accessToken);
    res.json({ accessToken });
  } catch (error: any) {
    logger.error('Error exchanging code for access token:', error);
    res.status(500).json({ message: error.message });
  }
});

api.get('/linkedin/data', async (req: Request, res: Response) => {
  logger.info('Received request to fetch LinkedIn data');
  const accessToken = req.headers.authorization?.split(' ')[1];
  logger.info('Received request to fetch LinkedIn profile');
  console.log('Received Access Token:', accessToken); // Debugging: Log received access token
  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
    const data = await getLinkedInData(accessToken, redirectUri);
    res.json(data);
  } catch (error: any) {
    logger.error(`Error fetching LinkedIn data: ${error.message}`);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

api.get('/linkedin/profile', async (req: Request, res: Response) => {
  logger.info('Received request to fetch LinkedIn profile');
  const accessToken = req.headers.authorization?.split(' ')[1];
  logger.info('Received access token:', accessToken);

  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
    const profileData = await getLinkedInData(accessToken, 'userinfo');
    logger.info('Fetched LinkedIn profile:', profileData);
    res.json(profileData);
  } catch (error: any) {
    logger.error('Error fetching LinkedIn profile:', error);
    res.status(500).json({ message: error.message });
  }
});

api.get('/linkedin/skills', async (req: Request, res: Response) => {
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    logger.error('Access token is missing');
    return res.status(401).json({ message: 'Unauthorized: Access token is required' });
  }

  try {
    const skillsData = await getLinkedInData(accessToken, 'skills');
    res.json(skillsData);
  } catch (error: any) {
    logger.error('Error fetching LinkedIn skills:', error);
    res.status(500).json({ message: error.message });
  }
});

// Coaching Form

api.post('/submit-coach-form', async (req, res) => {
  logger.info('Received request to submit coaching form');
  const { userId, q1, q2, q3, q4, q5 } = req.body;
  logger.info('Received request to submit coaching form', { userId, q1, q2, q3, q4, q5 });

  if (!userId) {
    logger.error('User ID is required');
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const { error } = await supabase
      .from('coachvet')
      .insert([{ userId, q1, q2, q3, q4, q5 }]);
    logger.info('Inserted coaching form data into database');

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'Form submitted successfully' });
  } catch (error) {
    const message = (error as { message: string }).message || 'Error submitting coaching form.';
    logger.error('Error submitting coaching form:', error);
    res.status(500).json({ message });
  }
});

api.get('/fetch-coaches', async (req, res) => {
  logger.info('Received request to fetch coaches');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'coach');
    logger.info('Fetched coaches:', data);
    if (error) throw new Error(`Failed to fetch coaches: ${error.message}`);
    
    res.json(data);
    logger.info('Returned coaches:', data);
  } catch (error) {
    const message = (error as { message: string }).message || 'Error fetching coaches.';
    logger.error('Error fetching coaches:', error);
    res.status(500).json({ message });
  }
});

// User-Coach Selection
api.post('/create-coach-selection', async (req, res) => {
  const { userId, coachUserId } = req.body;

  try {
    // Validate that the coachUserId is a coach in the profiles table
    const { data: coachData, error: coachError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', coachUserId)
      .eq('role', 'coach');

    if (coachError) throw new Error(`Coach validation failed: ${coachError.message}`);
    if (coachData.length === 0) throw new Error('Coach not found.');

    // Update the user's profile with the selected coach ID
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ coach_selection: coachUserId })
      .eq('id', userId);

    if (updateError) throw new Error(`Failed to create coach-user relationship: ${updateError.message}`);

    res.json({ success: true });
  } catch (error: any) {
    const message = error.message || 'Error creating coach selection.';
    res.status(500).json({ message });
  }
});

api.post('/fetch-coach-bio-and-image', async (req, res) => {
  logger.info('Received request to fetch coach bio and image');
  const { coachUserId } = req.body;

  try {
    const { data, error } = await supabase
      .from('coach_signups')
      .select('*')
      .eq('id', coachUserId);

    logger.info('Fetched coach bio and image:', data);
    if (error) throw new Error(`Failed to fetch coach bio: ${error.message}`);
    if (data.length === 0) {
      return res.status(404).json({ message: 'Coach bio not found' });
    }
    res.json(data[0]);
    logger.info('Returned coach bio and image:', data[0]);
  } catch (error: any) {
    const message = error.message || 'An unexpected error occurred.';
    logger.error('Error fetching coach bio and image:', error);
    res.status(500).json({ message });
  }
});

app.get('/api/v1/verify-room', async (req, res) => {
  const roomUrl = req.query.roomUrl; // Get room URL from query parameters
  if (!roomUrl || typeof roomUrl !== 'string') {
    return res.status(400).send({ error: 'Room URL is required' });
  }

  const roomName = roomUrl.split('/').pop(); // Extract room name from URL
  const verifyUrl = `https://api.daily.co/v1/rooms/${roomName}`;

  try {
    const verifyResponse = await fetch(verifyUrl, {
      headers: { 'Authorization': `Bearer ${process.env.DAILY_API_KEY}` }
    });

    const roomData = await verifyResponse.json();
    if (!verifyResponse.ok) {
      throw new Error('Room URL is expired or invalid');
    }

    res.status(200).json({ room: roomData });
  } catch (error: any) {
    logger.error(`Error verifying room URL: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});


// API Endpoint to create and synchronize room URL
app.post('/api/v1/create-room', async (req, res) => {
  const profileId = req.body.profileId;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('related_user_id')
      .eq('id', profileId)
      .single();

    if (error || !profile) throw new Error(`Profile not found: ${error?.message}`);

    // Create room
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: { exp: Math.floor(Date.now() / 1000) + 7200 } }) // 2 hours expiration
    });

    const roomData = (await roomResponse.json()) as RoomResponse;
    if (!roomResponse.ok) throw new Error(`Failed to create room: ${roomData.error?.message}`);

    // Update profiles with new room URL
    const updateResponse = await supabase
      .from('profiles')
      .update({ room_url: roomData.url })
      .in('id', [profileId, profile.related_user_id]);

    if (updateResponse.error) throw new Error(`Failed to update profiles: ${updateResponse.error.message}`);

    res.status(200).json({ room_url: roomData.url });
  } catch (error: any) {
    logger.error('Room creation failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Google API User Info
async function fetchUserInfo(accessToken: string) {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.data) {
      throw new Error('Failed to fetch user details');
    }

    const userData = {
      access_token: accessToken,
      refresh_token: null,
      user: {
        name: response.data.name,
        email: response.data.email,
        picture: response.data.picture
      }
    };

    console.log('User data retrieved:', userData);
    logger.info('User data retrieved:', userData);

    return userData;
  } catch (error: any) {
    console.error('Error fetching user info:', error);
    logger.error('Error fetching user info:', error);
    throw error;
  }
}


api.get('/hello', (req, res) => {
  logger.info('Hello world endpoint called');
  res.status(200).send({ message: 'hello world' });
});

app.use('/api/v1', api);

app._router.stack.forEach((middleware) => {
  if (middleware.route) { // routes registered directly on the app
    console.log(middleware.route.path);
    logger.info(middleware.route.path);
  } else if (middleware.name === 'router') { // router middleware 
    middleware.handle.stack.forEach((handler) => {
      console.log(handler.route.path);
      logger.info(handler.route.path);
    });
  }
});

const port = process.env.PORT || 3333;
server.listen(port, () => {
  logger.info(`Server started on port ${port}`);
});
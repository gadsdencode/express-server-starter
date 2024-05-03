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

config(); // Loads environment variables from .env file

// Websocket interface [Uncomment to use]
/* interface WebSocketMessage {
  type: string;
  messageId?: string;
  senderId?: string;
  reaction?: string;
  text?: string;
  chat_id?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  createdAt?: string;
  updatedAt?: string;
  author_id?: string;
  content: string;
}
*/
/* type Error = {
  message: string;
} */

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

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000';

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Google Calendar API client
const googleCalendarClient = google.calendar({
  version: 'v3',
  auth: oauth2Client
});

// Winston Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

app.use((req, res, next) => {
  logger.info(`Handling ${req.method} request for ${req.url}`);
  next();
});

// Healthcheck endpoint
app.get('/', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Supabase Functionality [Uncomment to use]
/* 
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR-SUPABASE-URL-HERE';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'YOUR-SUPABASE-ANON-KEY-HERE';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
*/

// Websocket Functionality [Uncomment to use]
/* 
const wss = new WebSocketServer({ server, path: '/api/v1/ws' });

wss.on('connection', (ws: WebSocket) => {
  logger.info('WebSocket connection established');

  ws.on('error', (error: Error) => {
    logger.error('WebSocket error:', error);
  });

  ws.on('message', async (rawData: string) => {
    try {
      const message: WebSocketMessage = JSON.parse(rawData);
      await handleWebSocketMessage(message, ws);
    } catch (error) {
      logger.error('Error parsing WebSocket message:', error);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
});

async function handleWebSocketMessage(message: WebSocketMessage, ws: WebSocket) {
  if (message.type === 'reaction') {
    await handleReaction(message, ws);
  } else if (message.type === 'typing_started' || message.type === 'typing_stopped') {
    await handleTypingEvent(message, ws);
  } else {
    await handleMessage(message, ws);
  }
}

async function handleTypingEvent(message: WebSocketMessage, ws: WebSocket) {
  const { type, senderId, chat_id } = message;
  logger.info(`Received typing event from ${senderId} in chat ${chat_id}: ${type}`);

  if (!senderId || !chat_id) {
    ws.send(JSON.stringify({ error: 'Sender ID and Chat ID are required for typing events' }));
    return;
  }

  let recipients = 0;
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, senderId, chat_id }));
      recipients++;
    }
  });
  logger.info(`Typing event ${type} from ${senderId} was sent to ${recipients} other clients.`);
}

async function handleReaction(message: WebSocketMessage, ws: WebSocket) {
  const { messageId, reaction, senderId } = message;

  if (!messageId) {
    ws.send(JSON.stringify({ error: 'Message ID is required for reactions' }));
    return;
  }

  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (messageError || !messageData) {
    logger.error('Failed to fetch message for reaction:', messageError?.message);
    ws.send(JSON.stringify({ error: 'Failed to fetch message' }));
    return;
  }

  let updatedReactions = messageData.reactions || [];
  const reactionIndex = updatedReactions.findIndex(r => r.emoji === reaction && r.userId === senderId);

  if (reactionIndex !== -1) {
    updatedReactions[reactionIndex].count += 1;
  } else {
    updatedReactions.push({ emoji: reaction, userId: senderId, count: 1 });
  }

  const { error: updateError } = await supabase
    .from('messages')
    .update({ reactions: updatedReactions })
    .eq('id', messageId);

  if (updateError) {
    logger.error('Failed to update reactions:', updateError.message);
    ws.send(JSON.stringify({ error: 'Failed to update reactions' }));
    return;
  }

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'reactionUpdate', messageId: messageId, reactions: updatedReactions }));
    }
  });
}

async function handleMessage(message: WebSocketMessage, ws: WebSocket) {
  const { error } = await supabase
    .from('messages')
    .insert([{
      chat_id: message.chat_id,
      author_id: message.author_id,
      content: message.content,
      status: 'sent',
    }]);

  if (error) {
    logger.error('Failed to insert message:', error.message);
    ws.send(JSON.stringify({ error: 'Failed to process message' }));
    return;
  }

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
} 
*/

const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'hello world' });
});

// Add API endpoints here

api.get('/calendarevents', async (req: Request, res: Response) => {
  try {
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

  /* Example API Endpoint with Request/Response
  api.get('/search-suggestions', async (req: Request, res: Response) => {
  const { query } = req.query;
  
  if (!query) {
  return res.status(400).json({ message: 'Search query is required' });
  }
  
  try {
  const { data, error } = await supabase
  .from('profiles') // Supabase table name goes here
  .select('name') // Supabase column name goes here
  .ilike('name', `%${query}%`) // Supabase column name goes here
  .limit(5);
  
  if (error) throw error;
  
  const suggestions = data.map((profile) => profile.name);
  res.json(suggestions);
  } catch (error) {
  const message = (error as { message: string }).message || 'An unexpected error occurred';
  res.status(500).json({ message });
  }
  });
  */
  
  // No API endpoints below this line

  // Version the api
  app.use('/api/v1', api);
  
  const port = process.env.PORT || 3333;
  server.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
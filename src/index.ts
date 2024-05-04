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
import { createGoogleCalendarClient } from './utils/googleCalendarClient';
import { OAuth2Client } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const oAuth2Client = new OAuth2Client(googleClientId);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL and Key must be set in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

export async function handleGoogleLogin(req: Request, res: Response) {
  const { access_token } = req.body;
  if (!access_token) {
    return res.status(400).json({ message: 'Access token is required' });
  }

  try {
    const ticket = await oAuth2Client.verifyIdToken({
      idToken: access_token,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Email not found in token payload' });
    }

    const email = payload.email;
    const userId = payload.sub;  // Google user ID

    // Check if user already exists
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)

      if (userError) {
        throw new Error(userError.message);
      }
  
      if (users.length > 0) {
        return res.status(200).json({ message: 'User already exists', user: users[0] });
      }

    // Create new user
    const { data: newUser, error: newUserError } = await supabase
      .from('profiles')
      .insert([{ email, google_id: userId }])
      .single();

    if (newUserError) {
      throw new Error(newUserError.message);
    }

    return res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error during Google login:', error);
    return res.status(500).json({ message: 'Google login failed', details: (error as Error).message });
  }
}


api.get('/calendarevents', async (req: Request, res: Response) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const googleCalendarClient = createGoogleCalendarClient(accessToken);
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
  api.post('/googleAuth', handleGoogleLogin);

  api.get('/googleAuth', (req, res) => {
    res.status(200).send("GoogleAuth GET endpoint is reachable");
  });  

  app.use('/api/v1', api);
  
  const port = process.env.PORT || 3333;
  server.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
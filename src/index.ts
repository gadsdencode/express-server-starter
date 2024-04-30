import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
// import { body, validationResult } from 'express-validator';
// import crypto from 'crypto';
import { config } from 'dotenv';
import winston from 'winston';
// import fetch from 'node-fetch';


import { CopilotBackend, OpenAIAdapter } from "@copilotkit/backend";

config(); // Loads environment variables from .env file

// Error types [Uncomment to use]
/* type Error = {
  message: string;
} */

export const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

const rateLimiter = new RateLimiterMemory({
  points: 10, // Number of points
  duration: 1, // Per second
});

// CORS setup
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  'https://atlas-mvp-demo.vercel.app', // Production URL
  'https://web-dev-713d.up.railway.app' // Server itself
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

app.use((err, req, res, next) => {
  logger.info(`Handling ${req.method} request for ${req.url}`);
  logger.error(`Unhandled Error: ${err.message}`);
  res.status(500).send({ error: 'An unexpected error occurred' });
  next();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason, promise);
  logger.info('Unhandled Rejection:', reason, promise);
});

// Healthcheck endpoint
app.get('/', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Supabase Functionality [Uncomment to use]

const supabaseUrl = process.env.SUPABASE_URL || 'YOUR-SUPABASE-URL-HERE';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'YOUR-SUPABASE-ANON-KEY-HERE';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.options('*', cors());


// Websocket Functionality [Uncomment to use]

io.use((socket, next) => {
  rateLimiter.consume(socket.handshake.address)
    .then(() => {
      next();
    })
    .catch(() => {
      socket.disconnect();
      console.error('Rate limit exceeded');
    });
});

io.on('connection', (socket) => {
  logger.info('WebSocket connection established');
  console.log('A user connected');

  socket.on('disconnect', () => {
    logger.info('User disconnected');
    console.log('User disconnected');
  });

  socket.on('postCreated', (post, callback) => {
    io.emit(JSON.stringify({ event: 'postCreated', post }));
    callback('Received');
  });

  socket.on('commentCreated', (comment, callback) => {
    io.emit(JSON.stringify({ event: 'commentCreated', comment }));
    callback('Received');
  });
});

  io.on('error', (error: Error) => {
    logger.error('WebSocketIO error:', error);
    console.log('WebSocketIO error:', error);
  }); 


const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'hello world' });
});

// Add API endpoints here

api.get('/posts', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*, author:author_id(username)')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching posts:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    const message = (error as { message: string }).message || 'An unexpected error occurred';
    res.status(500).json({ message });
  }
});

api.post('/posts', async (req: Request, res: Response) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  try {
    const { data, error } = await supabase
      .from('posts')
      .insert([{ title, content }])
      .single();

    if (error) {
      logger.error('Error creating post:', error);
      res.status(500).json({ error: 'Failed to create post' });
    } else {
      io.emit('postCreated', data);
      res.status(201).json(data);
    }
  } catch (error) {
    const message = (error as { message: string }).message || 'An unexpected error occurred';
    res.status(500).json({ message });
  }
});

// Comments API route
api.get('/posts/:id/comments', async (req: Request, res: Response) => {
  const postId = Number(req.params.id);

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    const message = (error as { message: string }).message || 'An unexpected error occurred';
    res.status(500).json({ message });
  }
});

api.post('/posts/:id/comments', async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: 'Content is required' });
  }

  try {
    const { data, error } = await supabase
      .from('comments')
      .insert([{ post_id: postId, content }])
      .single();

    if (error) {
      logger.error('Error creating comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    } else {
      io.emit('commentCreated', data);
      res.status(201).json(data);
    }
  } catch (error) {
    const message = (error as { message: string }).message || 'An unexpected error occurred';
    res.status(500).json({ message });
  }
});

api.post('/chat', (req, res) => {
  const copilotKit = new CopilotBackend();
  const openAIAdapter = new OpenAIAdapter();
  try {
    copilotKit.streamHttpServerResponse(req, res, openAIAdapter);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing request");
  }
});
  
  // No API endpoints below this line
  // Version the api
  app.use('/api/v1', api);
  
  const port = process.env.PORT || 3333;
  server.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
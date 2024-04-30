// websocket.ts
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import winston from 'winston';

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

export function setupWebSocket(server: HTTPServer) {
    const io = new SocketIOServer(server, {
        cors: {
          origin: process.env.ORIGIN,
          credentials: true
        },
        transports: ['websocket', 'polling'] // Explicitly specify to use WebSocket first
      });

  const rateLimiter = new RateLimiterMemory({
    points: 10, // Number of points
    duration: 1, // Per second
  });

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

  return io;
}
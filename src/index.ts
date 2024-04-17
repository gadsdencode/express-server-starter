import express from 'express';
import http from 'http';
import { CopilotBackend, OpenAIAdapter } from "@copilotkit/backend";
import cors from 'cors';
import { config } from 'dotenv';
import winston from 'winston';

config(); // Loads environment variables from .env file

export const app = express();

// Common CORS headers
const HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

// Express app handling normal routes
app.use(cors({
  origin: ['http://localhost:3000'], // Adjust according to actual frontend deployment
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get('/', (req, res) => {
  res.status(200).send('Server is up and running');
});

const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'Hello World' });
});

app.use('/api/v1', api);

// Custom server logic for CopilotBackend on port 4201
const customServer = http.createServer((request, response) => {
  try {
    const headers = {
      ...HEADERS,
      ...(request.method === "POST" && { "Content-Type": "application/json" }),
    };
    response.writeHead(200, headers);
    if (request.method == "POST") {
      const copilotKit = new CopilotBackend();
      const openaiAdapter = new OpenAIAdapter();
      copilotKit.streamHttpServerResponse(request, response, openaiAdapter);
    } else {
      response.end("OpenAI server ready to receive POST requests.");
    }
  } catch (err) {
    console.error(err);
    response.end("Error handling request.");
  }
});

// Dual servers listen on different ports
const expressPort = 3333; // Port for the Express app
const customPort = 4201; // Port for the CopilotKitBackend Server

app.listen(expressPort, () => {
  console.log(`Express server started on port ${expressPort}`);
});

customServer.listen(customPort, 'localhost', () => {
  console.log(`Custom server listening at http://localhost:${customPort}`);
});

import express from 'express';
import { config } from 'dotenv';
import winston from 'winston';
import { CopilotRuntime, OpenAIAdapter } from "@copilotkit/backend";
import cors from 'cors';

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

config(); // Initialize environment variables
logger.info('Initialized environment variables');

const app = express();
logger.info('Initialized Express');
const PORT = process.env.PORT || 3333;

// Configure CORS
app.use(cors({
  origin: process.env.ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));
logger.info(process.env.ORIGIN);
logger.info('Configured CORS');

app.use(express.json());
logger.info('Configured Express');
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`Handling ${req.method} request for ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.status(200).send('Server is up and running');
  logger.info('Sent response');
});

const api = express.Router();

api.get('/hello', (req, res) => {
  res.status(200).send({ message: 'Hello World' });
});

api.post('/chat', (req, res) => {
  logger.info('Handling chat request');
  const copilotKit = new CopilotRuntime();
  logger.info('Initialized CopilotRuntime');
  const openAIAdapter = new OpenAIAdapter({ model: "gpt-4o" });
  logger.info('Initialized OpenAIAdapter');
  try {
    copilotKit.streamHttpServerResponse(req, res, openAIAdapter);
    logger.info('Streamed response');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing request");
  }
});

app.use('/api/v1', api);
logger.info('Registered API routes');

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  logger.info(`Server listening on port ${PORT}`);
});


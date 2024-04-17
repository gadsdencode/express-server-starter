import express from 'express';
import { config } from 'dotenv';
import winston from 'winston';
import { CopilotBackend, OpenAIAdapter } from "@copilotkit/backend";
import cors from 'cors';

config(); // Initialize environment variables

const app = express();
const PORT = process.env.expressPort || 3333;

// Configure CORS
app.use(cors({
  origin: process.env.ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));

// Configure Winston for logging
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use('/api/v1', api);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
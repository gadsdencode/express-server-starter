// /server/linkedin.ts

import fetch from 'node-fetch';
import winston from 'winston';

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

  export async function getLinkedInAccessToken(code: string, redirectUri: string): Promise<string> {
    logger.info('Getting LinkedIn access token');
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID!,
        client_secret: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_SECRET!,
      }),
    });
    const data = await response.json();
    logger.info('LinkedIn access token data', data);
  
    if (!response.ok) {
      logger.error('Failed to fetch LinkedIn access token', data);
      throw new Error(data.error_description || 'Failed to fetch access token');
    }
  
    logger.info('LinkedIn access token', data.access_token);
    return data.access_token;
  }
  
  export async function getLinkedInData(accessToken: string, endpoint: string): Promise<any> {
    const response = await fetch(`https://api.linkedin.com/v2/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-RestLi-Protocol-Version': '2.0.0',
      },
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      logger.error(`LinkedIn API error: ${response.statusText}`, errorData);
      throw new Error(errorData.message || 'Failed to fetch LinkedIn data');
    }
  
    return await response.json();
  }
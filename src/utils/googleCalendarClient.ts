import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000';

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

export const createGoogleCalendarClient = () => {
  return google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });
};
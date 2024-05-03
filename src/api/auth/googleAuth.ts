import { createClient } from '../../utils/supabase/server';
import { Session, User } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000';

const oAuth2Client = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  redirectUri
);

interface GoogleLoginRequest extends Request {
  body: {
    access_token: string;
  };
}

interface AuthOtpResponse {
  data: {
    user: User | null;
    session: Session | null;
    messageId?: string | null | undefined;
    access_token: string;
  };
  error: Error | null;
}

/**
 * Extracts an access token from a Supabase session object.
 * @param session The session object containing the access token.
 * @returns The access token if available, or undefined.
 */
function fetchAccessTokenFromSession(session: Session | null): string | undefined {
  return session?.access_token;
}

export async function handleGoogleLogin(req: GoogleLoginRequest, res: Response) {
  if (req.method === 'POST') {
    const { access_token } = req.body;

    try {
      // Verify the access token
      const ticket = await oAuth2Client.verifyIdToken({
        idToken: access_token,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      const userId = payload ? payload['sub'] : undefined;
      const email = payload ? payload['email'] : undefined;

      const supabase = createClient();

      // Check if the user already exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      let user;

      if (existingUser) {
        // User already exists, update the user record if needed
        user = existingUser;
      } else {
        // Create a new user
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({ email, google_id: userId })
          .single();

        if (insertError) {
          throw insertError;
        }

        user = newUser;
      }

      // Generate a Supabase access token for the user
      const { data: authData, error: signInError } = await supabase.auth.signInWithOtp({
        email: user.email,
      }) as AuthOtpResponse;

      if (signInError) {
        throw signInError;
      }

      const supabaseAccessToken = fetchAccessTokenFromSession(authData.session);

      if (!supabaseAccessToken) {
        throw new Error('Failed to retrieve access token');
      }

      // Return the Supabase access token to the client
      res.status(200).json({ access_token: supabaseAccessToken });
    } catch (error) {
      console.error('Google login failed:', error);
      res.status(500).json({ error: 'Google login failed' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
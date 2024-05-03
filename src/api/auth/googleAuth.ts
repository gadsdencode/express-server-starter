import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';

// Assuming environment variables are set for Google OAuth2
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const oAuth2Client = new OAuth2Client(googleClientId);

interface GoogleLoginRequest extends Request {
  body: {
    access_token: string;
  };
}

export async function handleGoogleLogin(req: GoogleLoginRequest, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { access_token } = req.body;
  if (!access_token) {
    return res.status(400).json({ error: 'Access token is required' });
  }

  try {
    const ticket = await oAuth2Client.verifyIdToken({
      idToken: access_token,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    const userId = payload?.sub;
    const email = payload?.email;

    if (!email) {
      throw new Error('Email not found in token payload');
    }

    const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (userError && userError.message !== 'No rows found') {
      throw userError;
    }

    if (!user) {
      // User does not exist, create a new user record
      const { data: newUser, error: newUserError } = await supabase
        .from('profiles')
        .insert([{ email, google_id: userId }])
        .single();

      if (newUserError) {
        throw newUserError;
      }

      return res.status(201).json({ message: 'User created successfully', user: newUser });
    }

    // Existing user, return successful login response
    res.status(200).json({ message: 'Google login successful', user });
  } catch (error) {
    console.error('Google login failed:', error);
    res.status(500).json({ error: 'Google login failed', details: (error as Error).message });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('posts')
      .select('*, author:author_id(username)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    } else {
      res.status(200).json(data);
    }
  } else if (req.method === 'POST') {
    const { title, content } = req.body;

    const { data, error } = await supabase
      .from('posts')
      .insert([{ title, content }])
      .single();

    if (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: 'Failed to create post' });
    } else {
      res.status(201).json(data);
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
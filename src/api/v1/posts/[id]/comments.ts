import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = Number(req.query.id);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    } else {
      res.status(200).json(data);
    }
  } else if (req.method === 'POST') {
    const { content } = req.body;

    const { data, error } = await supabase
      .from('comments')
      .insert([{ post_id: postId, content }])
      .single();

    if (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    } else {
      res.status(201).json(data);
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
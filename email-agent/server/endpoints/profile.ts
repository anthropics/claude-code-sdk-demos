import * as fs from 'fs/promises';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function handleProfileEndpoint(req: Request): Promise<Response> {
  try {
    const profilePath = './agent/data/PROFILE.md';

    try {
      const content = await fs.readFile(profilePath, 'utf-8');
      return new Response(JSON.stringify({ content }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return new Response(JSON.stringify({ content: '' }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reading profile:', error);
    return new Response(JSON.stringify({ error: 'Failed to read profile' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
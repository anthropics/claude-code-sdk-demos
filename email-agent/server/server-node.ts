import "dotenv/config";
import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs/promises";
import * as path from "path";
import Database from "better-sqlite3";
import { WebSocketHandler } from "../ccsdk/websocket-handler";
import type { WSClient } from "../ccsdk/types";
import { DATABASE_PATH } from "../database/config";
import { DatabaseManager } from "../database/database-manager";
import { ImapManager } from "../database/imap-manager";
import {
  handleSyncEndpoint,
  handleSyncStatusEndpoint,
  handleProfileEndpoint,
  handleInboxEndpoint,
  handleSearchEndpoint,
  handleEmailDetailsEndpoint,
  handleBatchEmailsEndpoint
} from "./endpoints";

// Initialize DatabaseManager FIRST to create correct schema
const dbManager = DatabaseManager.getInstance();
const imapManager = ImapManager.getInstance();

const wsHandler = new WebSocketHandler(DATABASE_PATH);
const db = new Database(DATABASE_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_time TEXT NOT NULL,
    emails_synced INTEGER DEFAULT 0,
    emails_skipped INTEGER DEFAULT 0,
    sync_type TEXT DEFAULT 'manual'
  )
`);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Routes
  if (url.pathname === '/') {
    try {
      const html = await fs.readFile('./client/index.html', 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        ...corsHeaders,
      });
      res.end(html);
      return;
    } catch (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }

  if (url.pathname.startsWith('/client/') && url.pathname.endsWith('.css')) {
    try {
      const filePath = path.join(process.cwd(), url.pathname.substring(1));
      const cssContent = await fs.readFile(filePath, 'utf-8');

      const postcss = require('postcss');
      const tailwindcss = require('@tailwindcss/postcss');
      const autoprefixer = require('autoprefixer');

      const result = await postcss([
        tailwindcss(),
        autoprefixer,
      ]).process(cssContent, {
        from: filePath,
        to: undefined
      });

      res.writeHead(200, {
        'Content-Type': 'text/css',
        ...corsHeaders,
      });
      res.end(result.css);
      return;
    } catch (error) {
      console.error('CSS processing error:', error);
      res.writeHead(500, corsHeaders);
      res.end('CSS processing failed');
      return;
    }
  }

  if (url.pathname.startsWith('/client/') && (url.pathname.endsWith('.tsx') || url.pathname.endsWith('.ts'))) {
    try {
      const filePath = path.join(process.cwd(), url.pathname.substring(1));

      const esbuild = require('esbuild');
      const result = await esbuild.build({
        entryPoints: [filePath],
        bundle: true,
        format: 'esm',
        write: false,
        jsx: 'automatic',
      });

      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        ...corsHeaders,
      });
      res.end(result.outputFiles[0].text);
      return;
    } catch (error) {
      console.error('Transpilation error:', error);
      res.writeHead(500, corsHeaders);
      res.end('Transpilation failed');
      return;
    }
  }

  // API endpoints
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const request = await convertToRequest(req);
    const response = await handleSyncEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/sync/status' && req.method === 'GET') {
    const request = await convertToRequest(req);
    const response = await handleSyncStatusEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/profile' && req.method === 'GET') {
    const request = await convertToRequest(req);
    const response = await handleProfileEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/emails/inbox' && req.method === 'GET') {
    const request = await convertToRequest(req);
    const response = await handleInboxEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/emails/search' && req.method === 'POST') {
    const request = await convertToRequest(req);
    const response = await handleSearchEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname.startsWith('/api/email/') && req.method === 'GET') {
    const emailId = decodeURIComponent(url.pathname.split('/').pop()!);
    const request = await convertToRequest(req);
    const response = await handleEmailDetailsEndpoint(request, emailId);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/emails/batch' && req.method === 'POST') {
    const request = await convertToRequest(req);
    const response = await handleBatchEmailsEndpoint(request);
    await sendResponse(res, response);
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({
      error: 'Please use WebSocket connection at /ws for chat'
    }));
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end('Not Found');
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  const wsClient = ws as any as WSClient;
  wsClient.data = { sessionId: `${Date.now()}-${Math.random().toString(36).substring(7)}` };

  wsHandler.onOpen(wsClient);

  ws.on('message', (message: Buffer) => {
    wsHandler.onMessage(wsClient, message.toString());
  });

  ws.on('close', () => {
    wsHandler.onClose(wsClient);
  });
});

server.listen(3000, () => {
  console.log(`Server running at http://localhost:3000`);
  console.log('WebSocket endpoint available at ws://localhost:3000/ws');
  console.log('Visit http://localhost:3000 to view the email chat interface');
});

// Helper functions
async function convertToRequest(req: http.IncomingMessage): Promise<Request> {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body = null;

  if (hasBody) {
    // Buffer the body first to avoid duplex stream issues
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString('utf-8');
  }

  return new Request(url.toString(), {
    method: req.method,
    headers: req.headers as any,
    body: body,
  });
}

async function sendResponse(res: http.ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

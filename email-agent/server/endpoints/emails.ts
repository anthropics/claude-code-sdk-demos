import Database from "better-sqlite3";
import { DatabaseManager } from "../../database/database-manager";
import { ImapManager } from "../../database/imap-manager";
import { DATABASE_PATH } from "../../database/config";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const db = new Database(DATABASE_PATH);
const dbManager = DatabaseManager.getInstance();
const imapManager = ImapManager.getInstance();

export async function handleInboxEndpoint(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = new URLSearchParams(url.search);
    const limit = parseInt(params.get('limit') || '50');
    const includeRead = params.get('includeRead') !== 'false';

    const emails = dbManager.getRecentEmails(limit, includeRead);

    const emailMessages = emails.map(email => ({
      id: email.messageId,
      messageId: email.messageId,
      from: email.fromAddress,
      to: email.toAddresses || '',
      subject: email.subject || '',
      date: typeof email.dateSent === 'string' ? new Date(email.dateSent) : email.dateSent,
      body: email.bodyText || '',
      hasAttachments: email.hasAttachments,
      isRead: email.isRead,
      folder: email.folder,
      labels: email.labels
    }));

    return new Response(JSON.stringify(emailMessages), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch inbox emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

export async function handleSearchEndpoint(req: Request): Promise<Response> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 📥 POST /api/emails/search - Request received`);

  try {
    const body = await req.json() as any;
    const { headersOnly = false, ...criteria } = body;
    console.log(`[${new Date().toISOString()}] 🔍 Search criteria:`, JSON.stringify(criteria), `(headersOnly: ${headersOnly})`);

    if (criteria.from === 'me' || (Array.isArray(criteria.from) && criteria.from.includes('me'))) {
      const userEmail = process.env.EMAIL_ADDRESS || process.env.EMAIL_USER;
      if (userEmail) {
        if (Array.isArray(criteria.from)) {
          criteria.from = criteria.from.map((addr: any) => addr === 'me' ? userEmail : addr);
        } else {
          criteria.from = userEmail;
        }
        if (!criteria.folders || criteria.folders.length === 0) {
          criteria.folders = ['[Gmail]/Sent Mail', '[Gmail]/All Mail'];
          console.log(`[${new Date().toISOString()}] 📨 Auto-including Sent Mail folders for from:me search`);
        }
      }
    }

    if (criteria.gmailQuery && criteria.gmailQuery.includes('from:me')) {
      if (!criteria.folders || criteria.folders.length === 0) {
        criteria.folders = ['[Gmail]/Sent Mail', '[Gmail]/All Mail'];
        console.log(`[${new Date().toISOString()}] 📨 Auto-including Sent Mail folders for gmailQuery with from:me`);
      }
    }

    console.log(`[${new Date().toISOString()}] 📨 Starting IMAP search${headersOnly ? ' (headers only)' : ''}...`);
    const searchStartTime = Date.now();
    const imapResults = await imapManager.searchEmails(criteria, headersOnly);
    const searchDuration = Date.now() - searchStartTime;
    console.log(`[${new Date().toISOString()}] ✅ IMAP search completed in ${searchDuration}ms - Found ${imapResults.length} results`);

    // Save emails to database so they can be fetched later
    // Temporarily disabled due to schema issues
    // if (imapResults.length > 0) {
    //   dbManager.batchUpsertEmails(imapResults);
    //   console.log(`[${new Date().toISOString()}] 💾 Saved ${imapResults.length} emails to database`);
    // }

    const emailMessages = imapResults.map(({ email }) => ({
      id: email.messageId,
      messageId: email.messageId,
      from: email.fromAddress,
      to: email.toAddresses || '',
      subject: email.subject || '',
      date: typeof email.dateSent === 'string' ? new Date(email.dateSent) : email.dateSent,
      body: email.bodyText || '',
      hasAttachments: email.hasAttachments,
      isRead: email.isRead,
      folder: email.folder,
      labels: email.labels
    }));

    const totalDuration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ✅ POST /api/emails/search - Response sent (${emailMessages.length} emails) - Total: ${totalDuration}ms`);

    return new Response(JSON.stringify(emailMessages), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ❌ POST /api/emails/search - Error after ${totalDuration}ms:`, error);
    return new Response(JSON.stringify({
      error: 'Failed to search emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

export async function handleEmailDetailsEndpoint(req: Request, emailId: string): Promise<Response> {
  if (!emailId) {
    return new Response(JSON.stringify({ error: 'Invalid email ID' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }

  try {
    const email = db.prepare(`
      SELECT
        id,
        message_id,
        subject,
        from_address,
        from_name,
        date_sent,
        body_text,
        body_html,
        snippet,
        is_read,
        is_starred,
        has_attachments,
        attachment_count,
        folder
      FROM emails
      WHERE message_id = ?
    `).get(emailId);

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const recipients = db.prepare(`
      SELECT r.type, r.address
      FROM recipients r
      JOIN emails e ON r.email_id = e.id
      WHERE e.message_id = ?
    `).all(emailId);

    const recipientsByType = {
      to: [] as string[],
      cc: [] as string[],
      bcc: [] as string[],
    };

    for (const recipient of recipients as any[]) {
      if (recipientsByType[recipient.type as keyof typeof recipientsByType]) {
        recipientsByType[recipient.type as keyof typeof recipientsByType].push(recipient.address);
      }
    }

    const emailData = {
      ...email,
      recipients: recipientsByType,
    };

    return new Response(JSON.stringify(emailData), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch email' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

export async function handleBatchEmailsEndpoint(req: Request): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { ids } = body;

    if (!ids || !Array.isArray(ids)) {
      return new Response(JSON.stringify({ error: 'Invalid request: ids array required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ emails: [] }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const emails = dbManager.getEmailsByMessageIds(ids);

    const emailMessages = emails.map((email: any) => ({
      id: email.messageId,
      messageId: email.messageId,
      from: email.fromAddress,
      to: email.toAddresses,
      subject: email.subject,
      date: email.dateSent,
      body: email.bodyText || email.bodyHtml || email.snippet || '',
      hasAttachments: email.hasAttachments,
      isRead: email.isRead,
      folder: email.folder || 'INBOX',
      labels: email.labels || []
    }));

    return new Response(JSON.stringify({ emails: emailMessages }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error fetching emails by IDs:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch emails' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
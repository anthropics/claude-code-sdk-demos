import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailRecord, Attachment, SearchCriteria } from './database-manager';

interface ImapConfig {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  tls?: boolean;
  secure?: boolean;
}

export class ImapManager {
  private static instance: ImapManager;
  private client: ImapFlow | null = null;
  private config: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    logger: boolean;
  };

  private constructor(config?: Partial<ImapConfig>) {
    const EMAIL = config?.user || process.env.EMAIL_ADDRESS || process.env.EMAIL_USER;
    const PASSWORD = config?.password || process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

    console.log('🔧 ImapFlow Configuration:');
    console.log('   Email:', EMAIL ? `${EMAIL.substring(0, 3)}...@${EMAIL.split('@')[1]}` : 'NOT SET');
    console.log('   Password:', PASSWORD ? '***SET***' : 'NOT SET');
    console.log('   Host:', config?.host || process.env.IMAP_HOST || 'imap.gmail.com');

    if (!EMAIL || !PASSWORD) {
      throw new Error(
        'Email credentials not found! Please provide email configuration or set EMAIL_ADDRESS and EMAIL_APP_PASSWORD environment variables'
      );
    }

    this.config = {
      host: config?.host || process.env.IMAP_HOST || 'imap.gmail.com',
      port: config?.port || parseInt(process.env.IMAP_PORT || '993'),
      secure: config?.secure !== undefined ? config.secure : true,
      auth: {
        user: EMAIL,
        pass: PASSWORD,
      },
      logger: false, // Set to console for debugging
    };
  }

  public static getInstance(config?: Partial<ImapConfig>): ImapManager {
    if (!ImapManager.instance) {
      ImapManager.instance = new ImapManager(config);
    }
    return ImapManager.instance;
  }

  private async getClient(): Promise<ImapFlow> {
    // Always create a fresh connection to avoid lock contention
    if (this.client) {
      console.log('🔄 Closing existing IMAP connection');
      await this.client.logout().catch(() => {});
      this.client = null;
    }

    console.log('🔌 Creating new ImapFlow client');
    this.client = new ImapFlow(this.config);

    this.client.on('error', (err) => {
      console.error('❌ ImapFlow error:', err);
    });

    console.log('📡 Connecting to IMAP server...');
    await this.client.connect();
    console.log('✅ Connected to IMAP server');

    return this.client;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  async searchEmails(
    criteria: SearchCriteria,
    headersOnly: boolean = false
  ): Promise<Array<{ email: EmailRecord; attachments: Attachment[] }>> {
    const client = await this.getClient();
    const results: Array<{ email: EmailRecord; attachments: Attachment[] }> = [];

    try {
      // Determine which mailbox to search
      const mailbox = criteria.folders && criteria.folders.length > 0
        ? criteria.folders[0]
        : 'INBOX';

      console.log(`📂 Opening mailbox: ${mailbox}`);
      const lock = await client.getMailboxLock(mailbox);

      try {
        // Build search query
        const searchQuery: any = this.buildSearchQuery(criteria);
        console.log('🔍 Search query:', JSON.stringify(searchQuery));

        // Get list of UIDs that match the search
        console.log('🔍 Searching for matching UIDs...');
        const matchingUids = await client.search(searchQuery, { uid: true });
        console.log(`📊 Found ${matchingUids.length} matching UIDs`);

        // Sort by UID descending (higher UID = more recent) and apply limit
        const sortedUids = matchingUids.sort((a, b) => b - a);
        const uidsToFetch = criteria.limit
          ? sortedUids.slice(0, criteria.limit)
          : sortedUids;

        console.log(`📥 Will fetch ${uidsToFetch.length} messages (most recent first)`);

        // Fetch each message individually with fetchOne
        for (const uid of uidsToFetch) {
          const fetchOptions: any = {
            envelope: true,
            flags: true,
          };

          // For full body, fetch source (RFC822)
          if (!headersOnly) {
            fetchOptions.source = true;
          }

          console.log(`📥 Fetching UID ${uid}${!headersOnly ? ' with full source' : ''}...`);

          const msg = await client.fetchOne(uid.toString(), fetchOptions, { uid: true });

          console.log(`📩 Fetched UID ${uid}, source size: ${msg.source?.length || 0} bytes`);

          try {
            let parsed: any;

            if (headersOnly) {
              // For headers-only, construct minimal email from envelope
              parsed = {
                messageId: msg.envelope.messageId || `<uid-${uid}>`,
                from: this.formatAddress(msg.envelope.from),
                to: this.formatAddress(msg.envelope.to),
                subject: msg.envelope.subject || '',
                date: msg.envelope.date || new Date(),
                text: '',
                html: null,
              };
            } else {
              // Parse the full RFC822 source with simpleParser
              console.log(`📦 Parsing email source for UID ${uid}...`);

              if (msg.source) {
                parsed = await simpleParser(msg.source);
                console.log(`✅ Parsed email UID ${uid}: text=${parsed.text?.length || 0}b, html=${parsed.html?.length || 0}b`);
              } else {
                console.log(`⚠️ No source returned for UID ${uid}`);
                // Fallback to envelope
                parsed = {
                  messageId: msg.envelope.messageId || `<uid-${uid}>`,
                  from: { text: this.formatAddress(msg.envelope.from) },
                  to: { text: this.formatAddress(msg.envelope.to) },
                  subject: msg.envelope.subject || '',
                  date: msg.envelope.date || new Date(),
                  text: '[No source returned]',
                  html: null,
                  attachments: [],
                };
              }
            }

            const emailRecord: EmailRecord = {
              messageId: parsed.messageId || `<uid-${uid}>`,
              threadId: msg.envelope.inReplyTo || undefined,
              inReplyTo: msg.envelope.inReplyTo || undefined,
              dateSent: parsed.date || msg.envelope.date || new Date(),
              subject: parsed.subject || msg.envelope.subject || '',
              fromAddress: parsed.from?.text || this.formatAddress(msg.envelope.from) || '',
              fromName: parsed.from?.value?.[0]?.name || '',
              toAddresses: parsed.to?.text || this.formatAddress(msg.envelope.to) || '',
              ccAddresses: parsed.cc?.text || this.formatAddress(msg.envelope.cc) || '',
              bccAddresses: parsed.bcc?.text || this.formatAddress(msg.envelope.bcc) || '',
              replyTo: parsed.replyTo?.text || '',
              bodyText: parsed.text || '',
              bodyHtml: parsed.html || '',
              snippet: (parsed.text || '').substring(0, 200),
              isRead: msg.flags?.has('\\Seen') || false,
              isStarred: msg.flags?.has('\\Flagged') || false,
              isImportant: false,
              isDraft: msg.flags?.has('\\Draft') || false,
              isSent: false,
              isTrash: false,
              isSpam: false,
              sizeBytes: msg.size || 0,
              hasAttachments: parsed.attachments?.length > 0 || false,
              attachmentCount: parsed.attachments?.length || 0,
              folder: mailbox,
              labels: [],
            };

            const attachments: Attachment[] = (parsed.attachments || []).map((att: any) => ({
              filename: att.filename || 'unnamed',
              contentType: att.contentType || '',
              sizeBytes: att.size || 0,
              contentId: att.contentId || '',
              isInline: att.contentDisposition === 'inline',
            }));

            results.push({ email: emailRecord, attachments });
          } catch (err) {
            console.error(`❌ Error processing message ${uid}:`, err);
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('❌ IMAP search error:', err);
      throw err;
    }

    return results;
  }

  private buildSearchQuery(criteria: SearchCriteria): any {
    // X-GM-RAW doesn't work properly with ImapFlow, parse Gmail query instead
    if (criteria.gmailQuery) {
      return this.parseGmailQuery(criteria.gmailQuery);
    }

    // Build standard IMAP search
    const query: any = {};

    if (criteria.from) {
      const fromAddresses = Array.isArray(criteria.from) ? criteria.from : [criteria.from];
      if (fromAddresses.length === 1) {
        query.from = fromAddresses[0];
      } else {
        // For multiple addresses, use OR
        query.or = fromAddresses.map(addr => ({ from: addr }));
      }
    }

    if (criteria.to) {
      const toAddresses = Array.isArray(criteria.to) ? criteria.to : [criteria.to];
      if (toAddresses.length === 1) {
        query.to = toAddresses[0];
      } else {
        query.or = query.or || [];
        query.or.push(...toAddresses.map(addr => ({ to: addr })));
      }
    }

    if (criteria.subject) {
      query.subject = criteria.subject;
    }

    if (criteria.dateRange) {
      if (criteria.dateRange.start) {
        query.since = criteria.dateRange.start;
      }
      if (criteria.dateRange.end) {
        query.before = criteria.dateRange.end;
      }
    }

    if (criteria.isUnread) {
      query.unseen = true;
    }

    // If no criteria, return all
    if (Object.keys(query).length === 0) {
      return { all: true };
    }

    return query;
  }

  private parseGmailQuery(gmailQuery: string): any {
    const query: any = {};

    // Extract from: field
    const fromMatch = gmailQuery.match(/from:(\S+)/i);
    if (fromMatch) {
      query.from = fromMatch[1];
    }

    // Extract to: field
    const toMatch = gmailQuery.match(/to:(\S+)/i);
    if (toMatch) {
      query.to = toMatch[1];
    }

    // Extract subject: field
    const subjectMatch = gmailQuery.match(/subject:["']?([^"']+)["']?/i);
    if (subjectMatch) {
      query.subject = subjectMatch[1];
    }

    // Extract newer_than: / after: fields
    const newerMatch = gmailQuery.match(/(?:newer_than|after):(\d+)([dmy])/i);
    if (newerMatch) {
      const value = parseInt(newerMatch[1]);
      const unit = newerMatch[2].toLowerCase();
      const date = new Date();
      if (unit === 'd') date.setDate(date.getDate() - value);
      else if (unit === 'm') date.setMonth(date.getMonth() - value);
      else if (unit === 'y') date.setFullYear(date.getFullYear() - value);
      query.since = date;
    }

    // If no specific criteria, return all
    if (Object.keys(query).length === 0) {
      return { all: true };
    }

    return query;
  }

  private formatAddress(addresses: any): string {
    if (!addresses || !Array.isArray(addresses)) return '';
    return addresses
      .map((addr) => (addr.name ? `${addr.name} <${addr.address}>` : addr.address))
      .join(', ');
  }
}

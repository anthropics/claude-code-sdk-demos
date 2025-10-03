import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { DATABASE_PATH } from "./config";

export interface EmailRecord {
  id?: number;
  message_id: string;
  thread_id?: string;
  in_reply_to?: string;
  email_references?: string;
  date_sent: Date | string;
  date_received?: Date | string;
  subject?: string;
  from_address: string;
  from_name?: string;
  reply_to?: string;
  body_text?: string;
  body_html?: string;
  snippet?: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_important?: boolean;
  is_draft?: boolean;
  is_sent?: boolean;
  is_trash?: boolean;
  is_spam?: boolean;
  size_bytes?: number;
  has_attachments?: boolean;
  attachment_count?: number;
  folder?: string;
  labels?: string;
  raw_headers?: string;
}

export interface Recipient {
  email_id: number;
  type: 'to' | 'cc' | 'bcc';
  address: string;
  name?: string;
}

export interface Attachment {
  email_id: number;
  filename: string;
  content_type?: string;
  size_bytes?: number;
  content_id?: string;
  is_inline?: boolean;
}

export interface SearchOptions {
  query?: string;
  from?: string;
  to?: string;
  domain?: string;
  subject?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasAttachments?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  folder?: string;
  threadId?: string;
  limit?: number;
  offset?: number;
}

export class EmailDatabase {
  public db: Database;
  private dbPath: string;

  constructor(dbPath: string = DATABASE_PATH) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    // Skip initialization - DatabaseManager handles schema creation
    // this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Create tables first
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        in_reply_to TEXT,
        email_references TEXT,
        date_sent DATETIME NOT NULL,
        date_received DATETIME DEFAULT CURRENT_TIMESTAMP,
        subject TEXT,
        from_address TEXT NOT NULL,
        from_name TEXT,
        reply_to TEXT,
        body_text TEXT,
        body_html TEXT,
        snippet TEXT,
        is_read BOOLEAN DEFAULT 0,
        is_starred BOOLEAN DEFAULT 0,
        is_important BOOLEAN DEFAULT 0,
        is_draft BOOLEAN DEFAULT 0,
        is_sent BOOLEAN DEFAULT 0,
        is_trash BOOLEAN DEFAULT 0,
        is_spam BOOLEAN DEFAULT 0,
        size_bytes INTEGER DEFAULT 0,
        has_attachments BOOLEAN DEFAULT 0,
        attachment_count INTEGER DEFAULT 0,
        folder TEXT DEFAULT 'INBOX',
        labels TEXT,
        raw_headers TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('to', 'cc', 'bcc')) NOT NULL,
        address TEXT NOT NULL,
        name TEXT,
        domain TEXT GENERATED ALWAYS AS (
          LOWER(SUBSTR(address, INSTR(address, '@') + 1))
        ) STORED,
        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER,
        content_id TEXT,
        is_inline BOOLEAN DEFAULT 0,
        file_extension TEXT GENERATED ALWAYS AS (
          LOWER(SUBSTR(filename, INSTR(filename, '.') + 1))
        ) STORED,
        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      )
    `);

    // Create FTS5 table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
        message_id UNINDEXED,
        subject,
        from_address,
        from_name,
        body_text,
        recipient_addresses,
        attachment_names,
        tokenize = 'porter unicode61'
      )
    `);

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_emails_date_sent ON emails(date_sent DESC)",
      "CREATE INDEX IF NOT EXISTS idx_emails_from_address ON emails(from_address)",
      "CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id)",
      "CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id)",
      "CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read)",
      "CREATE INDEX IF NOT EXISTS idx_emails_is_starred ON emails(is_starred)",
      "CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder)",
      "CREATE INDEX IF NOT EXISTS idx_emails_has_attachments ON emails(has_attachments)",
      "CREATE INDEX IF NOT EXISTS idx_recipients_email_id ON recipients(email_id)",
      "CREATE INDEX IF NOT EXISTS idx_recipients_address ON recipients(address)",
      "CREATE INDEX IF NOT EXISTS idx_recipients_domain ON recipients(domain)",
      "CREATE INDEX IF NOT EXISTS idx_recipients_type ON recipients(type)",
      "CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id)",
      "CREATE INDEX IF NOT EXISTS idx_attachments_extension ON attachments(file_extension)"
    ];

    for (const index of indexes) {
      this.db.exec(index);
    }

    // Create triggers
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS emails_fts_insert 
      AFTER INSERT ON emails
      BEGIN
        INSERT INTO emails_fts(message_id, subject, from_address, from_name, body_text)
        VALUES (NEW.message_id, NEW.subject, NEW.from_address, NEW.from_name, NEW.body_text);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS emails_fts_update 
      AFTER UPDATE ON emails
      BEGIN
        UPDATE emails_fts 
        SET subject = NEW.subject,
            from_address = NEW.from_address,
            from_name = NEW.from_name,
            body_text = NEW.body_text
        WHERE message_id = NEW.message_id;
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS emails_fts_delete 
      AFTER DELETE ON emails
      BEGIN
        DELETE FROM emails_fts WHERE message_id = OLD.message_id;
      END
    `);
  }

  // Insert email with recipients and attachments
  insertEmail(
    email: EmailRecord,
    recipients: Recipient[] = [],
    attachments: Attachment[] = []
  ): number {
    const insertEmail = this.db.prepare(`
      INSERT INTO emails (
        message_id, thread_id, in_reply_to, email_references,
        date_sent, date_received, subject, from_address, from_name,
        reply_to, body_text, body_html, snippet,
        is_read, is_starred, is_important, is_draft, is_sent,
        is_trash, is_spam, size_bytes, has_attachments,
        attachment_count, folder, labels, raw_headers
      ) VALUES (
        $message_id, $thread_id, $in_reply_to, $email_references,
        $date_sent, $date_received, $subject, $from_address, $from_name,
        $reply_to, $body_text, $body_html, $snippet,
        $is_read, $is_starred, $is_important, $is_draft, $is_sent,
        $is_trash, $is_spam, $size_bytes, $has_attachments,
        $attachment_count, $folder, $labels, $raw_headers
      )
    `);

    const insertRecipient = this.db.prepare(`
      INSERT INTO recipients (email_id, type, address, name)
      VALUES ($email_id, $type, $address, $name)
    `);

    const insertAttachment = this.db.prepare(`
      INSERT INTO attachments (
        email_id, filename, content_type, size_bytes, content_id, is_inline
      ) VALUES (
        $email_id, $filename, $content_type, $size_bytes, $content_id, $is_inline
      )
    `);

    // Use transaction for consistency
    const insertTransaction = this.db.transaction(() => {
      const result = insertEmail.run({
        $message_id: email.message_id,
        $thread_id: email.thread_id || null,
        $in_reply_to: email.in_reply_to || null,
        $email_references: email.email_references || null,
        $date_sent: typeof email.date_sent === 'string' ? email.date_sent : email.date_sent.toISOString(),
        $date_received: email.date_received 
          ? (typeof email.date_received === 'string' ? email.date_received : email.date_received.toISOString())
          : new Date().toISOString(),
        $subject: email.subject || null,
        $from_address: email.from_address,
        $from_name: email.from_name || null,
        $reply_to: email.reply_to || null,
        $body_text: email.body_text || null,
        $body_html: email.body_html || null,
        $snippet: email.snippet || email.body_text?.substring(0, 200) || null,
        $is_read: email.is_read ? 1 : 0,
        $is_starred: email.is_starred ? 1 : 0,
        $is_important: email.is_important ? 1 : 0,
        $is_draft: email.is_draft ? 1 : 0,
        $is_sent: email.is_sent ? 1 : 0,
        $is_trash: email.is_trash ? 1 : 0,
        $is_spam: email.is_spam ? 1 : 0,
        $size_bytes: email.size_bytes || 0,
        $has_attachments: attachments.length > 0 ? 1 : 0,
        $attachment_count: attachments.length,
        $folder: email.folder || "INBOX",
        $labels: email.labels || null,
        $raw_headers: email.raw_headers || null,
      });

      const emailId = result.lastInsertRowid as number;

      // Insert recipients
      for (const recipient of recipients) {
        insertRecipient.run({
          $email_id: emailId,
          $type: recipient.type,
          $address: recipient.address,
          $name: recipient.name || null,
        });
      }

      // Insert attachments
      for (const attachment of attachments) {
        insertAttachment.run({
          $email_id: emailId,
          $filename: attachment.filename,
          $content_type: attachment.content_type || null,
          $size_bytes: attachment.size_bytes || 0,
          $content_id: attachment.content_id || null,
          $is_inline: attachment.is_inline ? 1 : 0,
        });
      }

      // Update FTS index with recipient addresses and attachment names
      const recipientAddresses = recipients.map(r => r.address).join(" ");
      const attachmentNames = attachments.map(a => a.filename).join(" ");
      
      this.db.prepare(`
        UPDATE emails_fts 
        SET recipient_addresses = $addresses, attachment_names = $names
        WHERE message_id = $message_id
      `).run({
        $addresses: recipientAddresses,
        $names: attachmentNames,
        $message_id: email.message_id,
      });

      return emailId;
    });

    return insertTransaction() as number;
  }

  // Search emails by domain (sent to any address at that domain)
  searchByDomain(domain: string, limit: number = 30): any[] {
    const query = this.db.prepare(`
      SELECT DISTINCT e.*, 
        GROUP_CONCAT(r.address) as all_recipients
      FROM emails e
      JOIN recipients r ON e.id = r.email_id
      WHERE r.domain = $domain
      GROUP BY e.id
      ORDER BY e.date_sent DESC
      LIMIT $limit
    `);

    return query.all({ $domain: domain.toLowerCase(), $limit: limit });
  }

  // Search emails related to a contact
  searchByContact(email: string, limit: number = 30): any[] {
    const query = this.db.prepare(`
      SELECT DISTINCT e.*
      FROM emails e
      LEFT JOIN recipients r ON e.id = r.email_id
      WHERE e.from_address = $email 
        OR r.address = $email
      ORDER BY e.date_sent DESC
      LIMIT $limit
    `);

    return query.all({ $email: email.toLowerCase(), $limit: limit });
  }

  // Search emails in a thread
  searchByThread(threadId: string): any[] {
    const query = this.db.prepare(`
      SELECT * FROM emails
      WHERE thread_id = $thread_id
      ORDER BY date_sent ASC
    `);

    return query.all({ $thread_id: threadId });
  }

  // Full-text search in subject and body
  searchByKeyword(keyword: string, useRegex: boolean = false, limit: number = 30): any[] {
    if (useRegex) {
      // SQLite doesn't support regex by default in Bun, use LIKE for pattern matching
      const pattern = `%${keyword}%`;
      const query = this.db.prepare(`
        SELECT * FROM emails
        WHERE subject LIKE $pattern
          OR body_text LIKE $pattern
        ORDER BY date_sent DESC
        LIMIT $limit
      `);
      return query.all({ $pattern: pattern, $limit: limit });
    } else {
      // Use FTS for regular keyword search
      const query = this.db.prepare(`
        SELECT e.* FROM emails e
        JOIN emails_fts fts ON e.message_id = fts.message_id
        WHERE emails_fts MATCH $keyword
        ORDER BY e.date_sent DESC
        LIMIT $limit
      `);
      return query.all({ $keyword: keyword, $limit: limit });
    }
  }

  // Get most recent emails
  getRecentEmails(limit: number = 50): any[] {
    const query = this.db.prepare(`
      SELECT e.*, 
        GROUP_CONCAT(CASE WHEN r.type = 'to' THEN r.address END) as to_addresses,
        GROUP_CONCAT(CASE WHEN r.type = 'cc' THEN r.address END) as cc_addresses,
        GROUP_CONCAT(CASE WHEN r.type = 'bcc' THEN r.address END) as bcc_addresses
      FROM emails e
      LEFT JOIN recipients r ON e.id = r.email_id
      GROUP BY e.id
      ORDER BY e.date_sent DESC
      LIMIT $limit
    `);

    return query.all({ $limit: limit });
  }

  // Advanced search with multiple criteria
  advancedSearch(options: SearchOptions): any[] {
    let whereClauses: string[] = [];
    let params: any = {};

    if (options.query) {
      whereClauses.push(`
        e.id IN (
          SELECT e2.id FROM emails e2
          JOIN emails_fts fts ON e2.message_id = fts.message_id
          WHERE emails_fts MATCH $query
        )
      `);
      params.$query = options.query;
    }

    if (options.from) {
      whereClauses.push("e.from_address LIKE $from");
      params.$from = `%${options.from}%`;
    }

    if (options.to) {
      whereClauses.push(`
        e.id IN (
          SELECT email_id FROM recipients 
          WHERE address LIKE $to AND type = 'to'
        )
      `);
      params.$to = `%${options.to}%`;
    }

    if (options.domain) {
      whereClauses.push(`
        e.id IN (
          SELECT email_id FROM recipients 
          WHERE domain = $domain
        )
      `);
      params.$domain = options.domain.toLowerCase();
    }

    if (options.subject) {
      whereClauses.push("e.subject LIKE $subject");
      params.$subject = `%${options.subject}%`;
    }

    if (options.dateFrom) {
      whereClauses.push("e.date_sent >= $dateFrom");
      params.$dateFrom = options.dateFrom.toISOString();
    }

    if (options.dateTo) {
      whereClauses.push("e.date_sent <= $dateTo");
      params.$dateTo = options.dateTo.toISOString();
    }

    if (options.hasAttachments !== undefined) {
      whereClauses.push("e.has_attachments = $hasAttachments");
      params.$hasAttachments = options.hasAttachments ? 1 : 0;
    }

    if (options.isUnread !== undefined) {
      whereClauses.push("e.is_read = $isRead");
      params.$isRead = options.isUnread ? 0 : 1;
    }

    if (options.isStarred !== undefined) {
      whereClauses.push("e.is_starred = $isStarred");
      params.$isStarred = options.isStarred ? 1 : 0;
    }

    if (options.folder) {
      whereClauses.push("e.folder = $folder");
      params.$folder = options.folder;
    }

    if (options.threadId) {
      whereClauses.push("e.thread_id = $threadId");
      params.$threadId = options.threadId;
    }

    const whereClause = whereClauses.length > 0 
      ? "WHERE " + whereClauses.join(" AND ")
      : "";

    const limit = options.limit || 30;
    const offset = options.offset || 0;

    const sql = `
      SELECT DISTINCT e.* FROM emails e
      ${whereClause}
      ORDER BY e.date_sent DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const query = this.db.prepare(sql);
    return query.all(params);
  }

  // Get email statistics
  getStatistics(): any {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_emails,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count,
        SUM(CASE WHEN is_starred = 1 THEN 1 ELSE 0 END) as starred_count,
        SUM(CASE WHEN has_attachments = 1 THEN 1 ELSE 0 END) as with_attachments,
        COUNT(DISTINCT thread_id) as thread_count,
        COUNT(DISTINCT from_address) as unique_senders,
        AVG(size_bytes) as avg_size_bytes,
        MIN(date_sent) as oldest_email,
        MAX(date_sent) as newest_email
      FROM emails
    `).get();

    return stats;
  }

  // Close database connection
  close(): void {
    this.db.close();
  }
}
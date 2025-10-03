import Database from "better-sqlite3";
import * as path from "path";
import { DATABASE_PATH } from "./config";

export interface EmailRecord {
  id?: number;
  messageId: string;
  threadId?: string;
  inReplyTo?: string;
  emailReferences?: string;
  dateSent: Date | string;
  dateReceived?: Date | string;
  subject?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses?: string;
  ccAddresses?: string;
  bccAddresses?: string;
  replyTo?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isDraft: boolean;
  isSent: boolean;
  isTrash: boolean;
  isSpam: boolean;
  sizeBytes: number;
  hasAttachments: boolean;
  attachmentCount: number;
  folder: string;
  labels?: string[];
  rawHeaders?: string;
}

export interface Attachment {
  emailId?: number;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  contentId?: string;
  isInline?: boolean;
}

export interface SearchCriteria {
  query?: string;
  from?: string | string[] | 'me';  // 'me' will be replaced with the user's email address
  to?: string | string[];
  subject?: string;
  dateRange?: { start: Date; end: Date };
  hasAttachments?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  folder?: string;
  folders?: string[];
  labels?: string[];
  threadId?: string;
  limit?: number;
  offset?: number;
  minSize?: number;
  maxSize?: number;
  gmailQuery?: string;  // Gmail-specific native search syntax using X-GM-RAW
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database;
  private dbPath: string;

  private constructor(dbPath: string = DATABASE_PATH) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initializeDatabase();
  }

  public static getInstance(dbPath?: string): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(dbPath);
    }
    return DatabaseManager.instance;
  }

  private initializeDatabase(): void {
    // Create main emails table (using snake_case to match queries)
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
        to_addresses TEXT,
        cc_addresses TEXT,
        bcc_addresses TEXT,
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

    // Create attachments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER,
        content_id TEXT,
        is_inline BOOLEAN DEFAULT 0,
        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      )
    `);

    // Create FTS5 table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
        messageId UNINDEXED,
        subject,
        fromAddress,
        fromName,
        bodyText,
        toAddresses,
        ccAddresses,
        attachmentFilenames,
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
      "CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id)"
    ];

    for (const index of indexes) {
      this.db.exec(index);
    }

    // Create triggers for FTS
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS emails_fts_insert
      AFTER INSERT ON emails
      BEGIN
        INSERT INTO emails_fts(
          messageId, subject, fromAddress, fromName, bodyText,
          toAddresses, ccAddresses
        )
        VALUES (
          NEW.messageId, NEW.subject, NEW.fromAddress, NEW.fromName,
          NEW.bodyText, NEW.toAddresses, NEW.ccAddresses
        );
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
            body_text = NEW.body_text,
            to_addresses = NEW.to_addresses,
            cc_addresses = NEW.cc_addresses
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

  // Upsert email with attachments
  public upsertEmail(email: EmailRecord, attachments: Attachment[] = []): number {
    const upsertEmail = this.db.prepare(`
      INSERT INTO emails (
        message_id, thread_id, in_reply_to, email_references,
        date_sent, date_received, subject, from_address, from_name,
        to_addresses, cc_addresses, bcc_addresses, reply_to,
        body_text, body_html, snippet,
        is_read, is_starred, is_important, is_draft, is_sent,
        is_trash, is_spam, size_bytes, has_attachments,
        attachment_count, folder, labels, raw_headers
      ) VALUES (
        $messageId, $threadId, $inReplyTo, $references,
        $dateSent, $dateReceived, $subject, $fromAddress, $fromName,
        $toAddresses, $ccAddresses, $bccAddresses, $replyTo,
        $bodyText, $bodyHtml, $snippet,
        $isRead, $isStarred, $isImportant, $isDraft, $isSent,
        $isTrash, $isSpam, $sizeBytes, $hasAttachments,
        $attachmentCount, $folder, $labels, $rawHeaders
      )
      ON CONFLICT(message_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        in_reply_to = excluded.in_reply_to,
        email_references = excluded.email_references,
        date_sent = excluded.date_sent,
        date_received = excluded.date_received,
        subject = excluded.subject,
        from_address = excluded.from_address,
        from_name = excluded.from_name,
        to_addresses = excluded.to_addresses,
        cc_addresses = excluded.cc_addresses,
        bcc_addresses = excluded.bcc_addresses,
        reply_to = excluded.reply_to,
        body_text = excluded.body_text,
        body_html = excluded.body_html,
        snippet = excluded.snippet,
        is_read = excluded.is_read,
        is_starred = excluded.is_starred,
        is_important = excluded.is_important,
        is_draft = excluded.is_draft,
        is_sent = excluded.is_sent,
        is_trash = excluded.is_trash,
        is_spam = excluded.is_spam,
        size_bytes = excluded.size_bytes,
        has_attachments = excluded.has_attachments,
        attachment_count = excluded.attachment_count,
        folder = excluded.folder,
        labels = excluded.labels,
        raw_headers = excluded.raw_headers,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `);

    const insertAttachment = this.db.prepare(`
      INSERT INTO attachments (
        email_id, filename, content_type, size_bytes, content_id, is_inline
      ) VALUES (
        $emailId, $filename, $contentType, $sizeBytes, $contentId, $isInline
      )
    `);

    const deleteAttachments = this.db.prepare(`
      DELETE FROM attachments WHERE email_id = $emailId
    `);

    // Use transaction for consistency
    const upsertTransaction = this.db.transaction(() => {
      const result = upsertEmail.get({
        $messageId: email.messageId,
        $threadId: email.threadId || null,
        $inReplyTo: email.inReplyTo || null,
        $emailReferences: email.emailReferences || null,
        $dateSent: typeof email.dateSent === 'string' ? email.dateSent : email.dateSent.toISOString(),
        $dateReceived: email.dateReceived
          ? (typeof email.dateReceived === 'string' ? email.dateReceived : email.dateReceived.toISOString())
          : new Date().toISOString(),
        $subject: email.subject || null,
        $fromAddress: email.fromAddress,
        $fromName: email.fromName || null,
        $toAddresses: email.toAddresses || null,
        $ccAddresses: email.ccAddresses || null,
        $bccAddresses: email.bccAddresses || null,
        $replyTo: email.replyTo || null,
        $bodyText: email.bodyText || null,
        $bodyHtml: email.bodyHtml || null,
        $snippet: email.snippet || email.bodyText?.substring(0, 200) || null,
        $isRead: email.isRead ? 1 : 0,
        $isStarred: email.isStarred ? 1 : 0,
        $isImportant: email.isImportant ? 1 : 0,
        $isDraft: email.isDraft ? 1 : 0,
        $isSent: email.isSent ? 1 : 0,
        $isTrash: email.isTrash ? 1 : 0,
        $isSpam: email.isSpam ? 1 : 0,
        $sizeBytes: email.sizeBytes || 0,
        $hasAttachments: attachments.length > 0 ? 1 : 0,
        $attachmentCount: attachments.length,
        $folder: email.folder || "INBOX",
        $labels: Array.isArray(email.labels) ? JSON.stringify(email.labels) : email.labels || null,
        $rawHeaders: email.rawHeaders || null,
      }) as any;

      const emailId = result.id;

      // Delete existing attachments and insert new ones
      if (attachments.length > 0) {
        deleteAttachments.run({ $emailId: emailId });

        for (const attachment of attachments) {
          insertAttachment.run({
            $emailId: emailId,
            $filename: attachment.filename,
            $contentType: attachment.contentType || null,
            $sizeBytes: attachment.sizeBytes || 0,
            $contentId: attachment.contentId || null,
            $isInline: attachment.isInline ? 1 : 0,
          });
        }

        // Update FTS with attachment filenames
        const attachmentNames = attachments.map(a => a.filename).join(" ");
        this.db.prepare(`
          UPDATE emails_fts
          SET attachmentFilenames = $names
          WHERE messageId = $messageId
        `).run({
          $names: attachmentNames,
          $messageId: email.messageId,
        });
      }

      return emailId;
    });

    return upsertTransaction() as number;
  }

  // Search emails
  public searchEmails(criteria: SearchCriteria): EmailRecord[] {
    let whereClauses: string[] = [];
    let params: any = {};

    // Full-text search
    if (criteria.query) {
      whereClauses.push(`
        e.id IN (
          SELECT e2.id FROM emails e2
          JOIN emails_fts fts ON e2.message_id = fts.message_id
          WHERE emails_fts MATCH $query
        )
      `);
      params.$query = criteria.query;
    }

    // From filter (supports array)
    if (criteria.from) {
      const fromAddresses = Array.isArray(criteria.from) ? criteria.from : [criteria.from];
      if (fromAddresses.length === 1) {
        whereClauses.push("e.from_address LIKE $from");
        params.$from = `%${fromAddresses[0]}%`;
      } else {
        const fromClauses = fromAddresses.map((_, i) => `e.from_address LIKE $from${i}`);
        whereClauses.push(`(${fromClauses.join(' OR ')})`);
        fromAddresses.forEach((addr, i) => {
          params[`$from${i}`] = `%${addr}%`;
        });
      }
    }

    // To filter (supports array)
    if (criteria.to) {
      const toAddresses = Array.isArray(criteria.to) ? criteria.to : [criteria.to];
      if (toAddresses.length === 1) {
        whereClauses.push("e.to_addresses LIKE $to");
        params.$to = `%${toAddresses[0]}%`;
      } else {
        const toClauses = toAddresses.map((_, i) => `e.to_addresses LIKE $to${i}`);
        whereClauses.push(`(${toClauses.join(' OR ')})`);
        toAddresses.forEach((addr, i) => {
          params[`$to${i}`] = `%${addr}%`;
        });
      }
    }

    // Subject filter
    if (criteria.subject) {
      whereClauses.push("e.subject LIKE $subject");
      params.$subject = `%${criteria.subject}%`;
    }

    // Date range filter
    if (criteria.dateRange) {
      if (criteria.dateRange.start) {
        whereClauses.push("e.date_sent >= $dateFrom");
        params.$dateFrom = criteria.dateRange.start.toISOString();
      }
      if (criteria.dateRange.end) {
        whereClauses.push("e.date_sent <= $dateTo");
        params.$dateTo = criteria.dateRange.end.toISOString();
      }
    }

    // Boolean filters
    if (criteria.hasAttachments !== undefined) {
      whereClauses.push("e.has_attachments = $hasAttachments");
      params.$hasAttachments = criteria.hasAttachments ? 1 : 0;
    }

    if (criteria.isUnread !== undefined) {
      whereClauses.push("e.is_read = $isRead");
      params.$isRead = criteria.isUnread ? 0 : 1;
    }

    if (criteria.isStarred !== undefined) {
      whereClauses.push("e.is_starred = $isStarred");
      params.$isStarred = criteria.isStarred ? 1 : 0;
    }

    // Folder filter (supports array via folders or single via folder)
    if (criteria.folders && criteria.folders.length > 0) {
      const folderPlaceholders = criteria.folders.map((_, i) => `$folder${i}`);
      whereClauses.push(`e.folder IN (${folderPlaceholders.join(', ')})`);
      criteria.folders.forEach((folder, i) => {
        params[`$folder${i}`] = folder;
      });
    } else if (criteria.folder) {
      whereClauses.push("e.folder = $folder");
      params.$folder = criteria.folder;
    }

    // Thread filter
    if (criteria.threadId) {
      whereClauses.push("e.threadId = $threadId");
      params.$threadId = criteria.threadId;
    }

    // Size filters
    if (criteria.minSize) {
      whereClauses.push("e.sizeBytes >= $minSize");
      params.$minSize = criteria.minSize;
    }

    if (criteria.maxSize) {
      whereClauses.push("e.sizeBytes <= $maxSize");
      params.$maxSize = criteria.maxSize;
    }

    const whereClause = whereClauses.length > 0
      ? "WHERE " + whereClauses.join(" AND ")
      : "";

    const limit = criteria.limit || 30;
    const offset = criteria.offset || 0;

    const sql = `
      SELECT e.* FROM emails e
      ${whereClause}
      ORDER BY e.date_sent DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const query = this.db.prepare(sql);
    const results = query.all(params);

    return results.map(row => this.mapRowToEmailRecord(row));
  }

  // Get recent emails
  public getRecentEmails(limit: number = 50, includeRead: boolean = true): EmailRecord[] {
    let sql = `
      SELECT * FROM emails
      WHERE folder IN ('INBOX', 'Inbox', '[Gmail]/All Mail')
    `;

    if (!includeRead) {
      sql += ' AND is_read = 0';
    }

    sql += ` ORDER BY date_sent DESC LIMIT $limit`;

    const query = this.db.prepare(sql);
    const results = query.all({ $limit: limit });

    return results.map(row => this.mapRowToEmailRecord(row));
  }

  // Get email by message ID
  public getEmailByMessageId(messageId: string): EmailRecord | null {
    const query = this.db.prepare(`
      SELECT * FROM emails WHERE message_id = $messageId
    `);
    const result = query.get({ $messageId: messageId });

    return result ? this.mapRowToEmailRecord(result) : null;
  }

  // Get multiple emails by IDs
  public getEmailsByIds(ids: number[]): EmailRecord[] {
    if (!ids.length) return [];

    const placeholders = ids.map(() => '?').join(',');
    const query = this.db.prepare(`
      SELECT * FROM emails
      WHERE id IN (${placeholders})
      ORDER BY date_sent DESC
    `);
    const results = query.all(...ids);

    return results.map(row => this.mapRowToEmailRecord(row));
  }

  // Get multiple emails by message IDs
  public getEmailsByMessageIds(messageIds: string[]): EmailRecord[] {
    if (!messageIds.length) return [];

    const placeholders = messageIds.map(() => '?').join(',');
    const query = this.db.prepare(`
      SELECT * FROM emails
      WHERE message_id IN (${placeholders})
      ORDER BY date_sent DESC
    `);
    const results = query.all(...messageIds);

    return results.map(row => this.mapRowToEmailRecord(row));
  }

  // Get attachments for an email
  public getAttachments(emailId: number): Attachment[] {
    const query = this.db.prepare(`
      SELECT * FROM attachments WHERE email_id = $emailId
    `);
    return query.all({ $emailId: emailId }) as Attachment[];
  }

  // Batch upsert emails
  public batchUpsertEmails(emails: Array<{ email: EmailRecord; attachments?: Attachment[] }>): void {
    const batchTransaction = this.db.transaction(() => {
      for (const { email, attachments } of emails) {
        this.upsertEmail(email, attachments || []);
      }
    });

    batchTransaction();
  }

  // Get statistics
  public getStatistics(): any {
    return this.db.prepare(`
      SELECT
        COUNT(*) as totalEmails,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unreadCount,
        SUM(CASE WHEN is_starred = 1 THEN 1 ELSE 0 END) as starredCount,
        SUM(CASE WHEN has_attachments = 1 THEN 1 ELSE 0 END) as withAttachments,
        COUNT(DISTINCT thread_id) as threadCount,
        COUNT(DISTINCT from_address) as uniqueSenders,
        AVG(size_bytes) as avgSizeBytes,
        MIN(date_sent) as oldestEmail,
        MAX(date_sent) as newestEmail
      FROM emails
    `).get();
  }

  // Helper method to map database row to EmailRecord
  private mapRowToEmailRecord(row: any): EmailRecord {
    return {
      id: row.id,
      messageId: row.message_id,
      threadId: row.thread_id,
      inReplyTo: row.in_reply_to,
      emailReferences: row.email_references,
      dateSent: new Date(row.date_sent),
      dateReceived: row.date_received ? new Date(row.date_received) : undefined,
      subject: row.subject,
      fromAddress: row.from_address,
      fromName: row.from_name,
      toAddresses: row.to_addresses,
      ccAddresses: row.cc_addresses,
      bccAddresses: row.bcc_addresses,
      replyTo: row.reply_to,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      snippet: row.snippet,
      isRead: Boolean(row.is_read),
      isStarred: Boolean(row.is_starred),
      isImportant: Boolean(row.is_important),
      isDraft: Boolean(row.is_draft),
      isSent: Boolean(row.is_sent),
      isTrash: Boolean(row.is_trash),
      isSpam: Boolean(row.is_spam),
      sizeBytes: row.size_bytes,
      hasAttachments: Boolean(row.has_attachments),
      attachmentCount: row.attachment_count,
      folder: row.folder,
      labels: row.labels ? JSON.parse(row.labels) : [],
      rawHeaders: row.raw_headers,
    };
  }

  // Close database connection
  public close(): void {
    this.db.close();
  }
}
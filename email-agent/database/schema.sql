-- SQLite Email Database Schema
-- Optimized for search performance with FTS5 and strategic indexes

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Main emails table
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,  -- RFC Message-ID header
    thread_id TEXT,                    -- For conversation threading
    in_reply_to TEXT,                  -- Parent message ID
    references TEXT,                   -- Thread references (space-separated)
    
    -- Timestamps
    date_sent DATETIME NOT NULL,
    date_received DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Email metadata
    subject TEXT,
    from_address TEXT NOT NULL,
    from_name TEXT,
    reply_to TEXT,
    
    -- Content
    body_text TEXT,
    body_html TEXT,
    snippet TEXT,                      -- First 200 chars for preview
    
    -- Status flags
    is_read BOOLEAN DEFAULT 0,
    is_starred BOOLEAN DEFAULT 0,
    is_important BOOLEAN DEFAULT 0,
    is_draft BOOLEAN DEFAULT 0,
    is_sent BOOLEAN DEFAULT 0,
    is_trash BOOLEAN DEFAULT 0,
    is_spam BOOLEAN DEFAULT 0,
    
    -- Size and attachments
    size_bytes INTEGER DEFAULT 0,
    has_attachments BOOLEAN DEFAULT 0,
    attachment_count INTEGER DEFAULT 0,
    
    -- Source information
    folder TEXT DEFAULT 'INBOX',
    labels TEXT,                       -- JSON array of labels
    
    -- Search optimization
    raw_headers TEXT,                  -- Store for advanced searches
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recipients table (normalized for efficient domain searches)
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
);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER,
    content_id TEXT,                   -- For inline attachments
    is_inline BOOLEAN DEFAULT 0,
    file_extension TEXT GENERATED ALWAYS AS (
        LOWER(SUBSTR(filename, INSTR(filename, '.') + 1))
    ) STORED,
    
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

-- Contacts table (auto-populated from emails)
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_address TEXT UNIQUE NOT NULL,
    display_name TEXT,
    domain TEXT GENERATED ALWAYS AS (
        LOWER(SUBSTR(email_address, INSTR(email_address, '@') + 1))
    ) STORED,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_count INTEGER DEFAULT 0,      -- Emails sent to this contact
    received_count INTEGER DEFAULT 0,  -- Emails received from this contact
    is_blocked BOOLEAN DEFAULT 0
);

-- Threads table for conversation management
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,               -- Thread ID
    subject TEXT,
    participant_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    last_message_date DATETIME,
    first_message_date DATETIME,
    has_unread BOOLEAN DEFAULT 0,
    has_starred BOOLEAN DEFAULT 0,
    snippet TEXT                       -- Latest message preview
);

-- Full-text search table for email content
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    message_id UNINDEXED,
    subject,
    from_address,
    from_name,
    body_text,
    recipient_addresses,  -- Denormalized for FTS
    attachment_names,     -- Denormalized for FTS
    tokenize = 'porter unicode61'
);

-- Search history for analytics and suggestions
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    query_type TEXT,
    result_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_emails_date_sent ON emails(date_sent DESC);
CREATE INDEX idx_emails_from_address ON emails(from_address);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_message_id ON emails(message_id);
CREATE INDEX idx_emails_is_read ON emails(is_read);
CREATE INDEX idx_emails_is_starred ON emails(is_starred);
CREATE INDEX idx_emails_folder ON emails(folder);
CREATE INDEX idx_emails_has_attachments ON emails(has_attachments);

CREATE INDEX idx_recipients_email_id ON recipients(email_id);
CREATE INDEX idx_recipients_address ON recipients(address);
CREATE INDEX idx_recipients_domain ON recipients(domain);
CREATE INDEX idx_recipients_type ON recipients(type);

CREATE INDEX idx_attachments_email_id ON attachments(email_id);
CREATE INDEX idx_attachments_extension ON attachments(file_extension);

CREATE INDEX idx_contacts_domain ON contacts(domain);
CREATE INDEX idx_contacts_email_address ON contacts(email_address);

CREATE INDEX idx_threads_last_message ON threads(last_message_date DESC);

-- Triggers to maintain updated_at timestamp
CREATE TRIGGER update_emails_timestamp 
AFTER UPDATE ON emails
BEGIN
    UPDATE emails SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- Trigger to maintain FTS index
CREATE TRIGGER emails_fts_insert 
AFTER INSERT ON emails
BEGIN
    INSERT INTO emails_fts(message_id, subject, from_address, from_name, body_text)
    VALUES (NEW.message_id, NEW.subject, NEW.from_address, NEW.from_name, NEW.body_text);
END;

CREATE TRIGGER emails_fts_update 
AFTER UPDATE ON emails
BEGIN
    UPDATE emails_fts 
    SET subject = NEW.subject,
        from_address = NEW.from_address,
        from_name = NEW.from_name,
        body_text = NEW.body_text
    WHERE message_id = NEW.message_id;
END;

CREATE TRIGGER emails_fts_delete 
AFTER DELETE ON emails
BEGIN
    DELETE FROM emails_fts WHERE message_id = OLD.message_id;
END;

-- Email actions table for caching generated AI actions
CREATE TABLE IF NOT EXISTS email_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_message_id TEXT NOT NULL,
    actions_json TEXT NOT NULL,  -- JSON string of the actions data
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT 1,  -- Flag to invalidate old actions if needed

    FOREIGN KEY (email_message_id) REFERENCES emails(message_id) ON DELETE CASCADE
);

-- Index for fast lookups by email message ID
CREATE INDEX idx_email_actions_message_id ON email_actions(email_message_id);
CREATE INDEX idx_email_actions_generated_at ON email_actions(generated_at DESC);

-- Views for common queries
CREATE VIEW IF NOT EXISTS email_summary AS
SELECT 
    e.id,
    e.message_id,
    e.subject,
    e.from_address,
    e.from_name,
    e.date_sent,
    e.snippet,
    e.is_read,
    e.is_starred,
    e.has_attachments,
    GROUP_CONCAT(
        CASE r.type 
            WHEN 'to' THEN r.address 
        END
    ) as to_addresses,
    GROUP_CONCAT(
        CASE r.type 
            WHEN 'cc' THEN r.address 
        END
    ) as cc_addresses
FROM emails e
LEFT JOIN recipients r ON e.id = r.email_id
GROUP BY e.id;

-- View for conversation threads
CREATE VIEW IF NOT EXISTS thread_summary AS
SELECT 
    t.id,
    t.subject,
    t.message_count,
    t.participant_count,
    t.last_message_date,
    t.has_unread,
    t.has_starred,
    t.snippet,
    GROUP_CONCAT(DISTINCT 
        COALESCE(c.display_name, e.from_address)
    ) as participants
FROM threads t
JOIN emails e ON e.thread_id = t.id
LEFT JOIN contacts c ON c.email_address = e.from_address
GROUP BY t.id;
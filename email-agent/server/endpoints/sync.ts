import Database from "better-sqlite3";
// import { EmailSyncService } from "../../database/email-sync"; // Disabled: uses old node-imap
import { DATABASE_PATH } from "../../database/config";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const db = new Database(DATABASE_PATH);
// const syncService = new EmailSyncService(DATABASE_PATH); // Disabled: uses old node-imap

export async function handleSyncEndpoint(req: Request): Promise<Response> {
  try {
    const lastSyncResult = db.prepare(`
      SELECT MAX(date_sent) as last_sync
      FROM emails
    `).get() as { last_sync: string | null };

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    let syncSince: Date;
    if (lastSyncResult?.last_sync) {
      const lastSyncDate = new Date(lastSyncResult.last_sync);
      syncSince = lastSyncDate > sevenDaysAgo ? lastSyncDate : sevenDaysAgo;
    } else {
      syncSince = sevenDaysAgo;
    }

    const lastSyncMeta = db.prepare(`
      SELECT sync_time FROM sync_metadata
      ORDER BY id DESC
      LIMIT 1
    `).get() as { sync_time: string } | undefined;

    if (lastSyncMeta?.sync_time) {
      const hourAgo = new Date();
      hourAgo.setHours(hourAgo.getHours() - 1);

      if (new Date(lastSyncMeta.sync_time) > hourAgo) {
        const emailCount = db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };
        return new Response(JSON.stringify({
          message: 'Already synced recently',
          lastSync: lastSyncMeta.sync_time,
          emailCount: emailCount.count
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }
    }

    console.log(`Starting sync for emails since ${syncSince.toISOString()}`);

    // Sync disabled: EmailSyncService uses old node-imap library
    // syncService.syncEmails({
    //   since: syncSince,
    //   limit: 30,
    // }).then(syncResult => {
    //   console.log(`Sync completed: ${syncResult.synced} synced, ${syncResult.skipped} skipped, ${syncResult.errors} errors`);
    //   db.run(`
    //     INSERT INTO sync_metadata (sync_time, emails_synced, emails_skipped, sync_type)
    //     VALUES (?, ?, ?, ?)
    //   `, [new Date().toISOString(), syncResult.synced, syncResult.skipped, 'auto']);
    // }).catch(error => {
    //   console.error('Background sync failed:', error);
    // });

    return new Response(JSON.stringify({
      success: false,
      message: 'Sync feature temporarily disabled during ImapFlow migration',
      syncStarted: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to sync emails',
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

export async function handleSyncStatusEndpoint(req: Request): Promise<Response> {
  try {
    const lastSyncMeta = db.prepare(`
      SELECT sync_time, emails_synced, emails_skipped
      FROM sync_metadata
      ORDER BY id DESC
      LIMIT 1
    `).get() as { sync_time: string | null; emails_synced: number; emails_skipped: number } | undefined;

    const emailCount = db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };

    const needsSync = !lastSyncMeta?.sync_time ||
      emailCount.count === 0 ||
      (new Date().getTime() - new Date(lastSyncMeta.sync_time).getTime()) > 3600000;

    return new Response(JSON.stringify({
      lastSync: lastSyncMeta?.sync_time || null,
      emailCount: emailCount.count,
      needsSync,
      lastSyncStats: lastSyncMeta ? {
        synced: lastSyncMeta.emails_synced,
        skipped: lastSyncMeta.emails_skipped
      } : null
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to check sync status'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
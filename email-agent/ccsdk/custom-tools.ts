import { tool, createSdkMcpServer } from "@anthropic-ai/claude-code";
import { ostring, z } from "zod";
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Lazy import EmailAPI to ensure env vars are loaded first
let EmailAPI: any;

async function getEmailAPI() {
  if (!EmailAPI) {
    const module = await import('../agent/email-api');
    EmailAPI = module.EmailAPI;
  }
  return EmailAPI;
}

export const customServer = createSdkMcpServer({
  name: "email",
  version: "1.0.0",
  tools: [
    tool(
      "search_inbox",
      "Search emails in the inbox using Gmail query syntax",
      {
        gmailQuery: z.string().describe(`Gmail query string (e.g., 'from:example@gmail.com subject:invoice')
          or
          'from:me ("address" OR "street") newer_than:1y`
        ),
      },
      async (args) => {
        try {
          const EmailAPIClass = await getEmailAPI();
          const api = new EmailAPIClass();
          console.log("=== SEARCH INBOX TOOL CALLED ===");
          console.log("Query:", args.gmailQuery);
          console.log("================================");

          const results = await api.searchEmails({
            gmailQuery: args.gmailQuery,
            limit: 10,
            headersOnly: false,  // Now using Node.js - full bodies should work
          });

          // Format results with full email content
          const formattedResults = results.map((email: any, index: number) => ({
            index: index + 1,
            id: email.messageId,
            messageId: email.messageId,
            date: email.date,
            from: email.from,
            to: email.to,
            subject: email.subject,
            body: email.body,
            hasAttachments: email.hasAttachments || false,
            isRead: email.isRead,
            folder: email.folder || 'Unknown',
            labels: email.labels || []
          }));

          // Extract just the IDs for easy reference
          const ids = results.map((email: any) => email.messageId);

          // Create logs directory if it doesn't exist
          const logsDir = path.join(__dirname, '..', 'logs');
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          // Generate timestamped log file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logFileName = `email-search-${timestamp}.json`;
          const logFilePath = path.join(logsDir, logFileName);

          // Write full results to log file
          const logData = {
            query: args.gmailQuery,
            timestamp: new Date().toISOString(),
            totalResults: results.length,
            ids: ids,
            emails: formattedResults
          };

          fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

          console.log(`Wrote ${formattedResults.length} emails to ${logFilePath}`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                totalResults: results.length,
                logFilePath: logFilePath,
                message: `Full email search results written to ${logFilePath}`
              }, null, 2)
            }]
          }; 
        } catch (error: any) {
          console.error("Error searching inbox:", error);
          return {
            content: [{
              type: "text",
              text: `Error searching inbox: ${error.message}`
            }]
          };
        }
      }
    ),

    tool(
      "read_emails",
      "Read multiple emails by their IDs to get full content and details",
      {
        ids: z.array(z.string()).describe("Array of email message IDs to fetch (e.g., ['<abc123@example.com>', '<def456@example.com>'])"),
      },
      async (args) => {
        try {
          const EmailAPIClass = await getEmailAPI();
          const api = new EmailAPIClass();
          console.log("=== READ EMAILS TOOL CALLED ===");
          console.log("IDs:", args.ids);
          console.log("================================");

          const emails = await api.getEmailsByIds(args.ids);

          // Format results with full email content
          const formattedResults = emails.map((email: any, index: number) => ({
            index: index + 1,
            id: email.messageId,
            messageId: email.messageId,
            date: email.date,
            from: email.from,
            to: email.to,
            subject: email.subject,
            body: email.body,
            hasAttachments: email.hasAttachments || false,
            isRead: email.isRead,
            folder: email.folder || 'Unknown',
            labels: email.labels || []
          }));

          console.log(`Fetched ${formattedResults.length} emails`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                totalFetched: formattedResults.length,
                emails: formattedResults
              }, null, 2)
            }]
          };
        } catch (error: any) {
          console.error("Error reading emails:", error);
          return {
            content: [{
              type: "text",
              text: `Error reading emails: ${error.message}`
            }]
          };
        }
      }
    ),
  ]
});
// Email Service - Phase 11b
// IMAP polling and SMTP sending

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const db = require('../db');
const emailParser = require('./emailParser');

// Email configuration (loaded from database or environment)
let imapConfig = null;
let smtpConfig = null;
let smtpTransporter = null;
let isPolling = false;
let pollInterval = null;

// Load email configuration from database
function loadConfig() {
  return new Promise((resolve, reject) => {
    db.all('SELECT config_key, config_value FROM email_config', [], (err, rows) => {
      if (err) return reject(err);

      const config = {};
      if (rows) {
        rows.forEach(row => {
          config[row.config_key] = row.config_value;
        });
      }

      // IMAP config
      if (config.imap_host) {
        imapConfig = {
          user: config.imap_user,
          password: config.imap_password,
          host: config.imap_host,
          port: parseInt(config.imap_port) || 993,
          tls: config.imap_tls !== 'false',
          tlsOptions: { rejectUnauthorized: false }
        };
      }

      // SMTP config
      if (config.smtp_host) {
        smtpConfig = {
          host: config.smtp_host,
          port: parseInt(config.smtp_port) || 587,
          secure: config.smtp_secure === 'true',
          auth: {
            user: config.smtp_user,
            pass: config.smtp_password
          }
        };

        smtpTransporter = nodemailer.createTransport(smtpConfig);
      }

      resolve({ imapConfig, smtpConfig });
    });
  });
}

// Save email configuration to database
function saveConfig(type, config) {
  return new Promise((resolve, reject) => {
    const prefix = type; // 'imap' or 'smtp'
    const entries = Object.entries(config);

    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO email_config (config_key, config_value, updated_at)
        VALUES (?, ?, datetime('now'))
      `);

      entries.forEach(([key, value]) => {
        stmt.run(`${prefix}_${key}`, value);
      });

      stmt.finalize((err) => {
        if (err) return reject(err);
        loadConfig().then(resolve).catch(reject);
      });
    });
  });
}

// Fetch unread emails from IMAP
function fetchUnreadEmails() {
  return new Promise((resolve, reject) => {
    if (!imapConfig) {
      return resolve({ success: false, error: 'IMAP not configured', emails: [] });
    }

    const imap = new Imap(imapConfig);
    const emails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Search for unread emails
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (!results || results.length === 0) {
            imap.end();
            return resolve({ success: true, emails: [], count: 0 });
          }

          const f = imap.fetch(results, { bodies: '', markSeen: true });

          f.on('message', (msg, seqno) => {
            let emailData = { seqno };

            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', () => {
                emailData.rawEmail = buffer;
              });
            });

            msg.once('attributes', (attrs) => {
              emailData.uid = attrs.uid;
              emailData.messageId = attrs['message-id'] || `msg-${attrs.uid}`;
            });

            msg.once('end', () => {
              emails.push(emailData);
            });
          });

          f.once('error', (err) => {
            imap.end();
            reject(err);
          });

          f.once('end', () => {
            imap.end();
            resolve({ success: true, emails, count: emails.length });
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// Parse raw email content
async function parseRawEmail(rawEmail) {
  try {
    const parsed = await simpleParser(rawEmail);
    return {
      from: parsed.from?.value?.[0]?.address || '',
      subject: parsed.subject || '',
      text: parsed.text || '',
      html: parsed.html || '',
      messageId: parsed.messageId || ''
    };
  } catch (err) {
    console.error('Email parsing error:', err);
    return null;
  }
}

// Poll for new emails and process them
async function pollEmails() {
  if (isPolling) {
    console.log('Already polling, skipping...');
    return { skipped: true };
  }

  isPolling = true;
  const results = {
    processed: 0,
    autoApproved: 0,
    pendingReview: 0,
    errors: 0,
    duplicates: 0
  };

  try {
    await loadConfig();

    if (!imapConfig) {
      console.log('IMAP not configured, skipping poll');
      return { success: false, error: 'IMAP not configured' };
    }

    const fetchResult = await fetchUnreadEmails();

    if (!fetchResult.success || fetchResult.emails.length === 0) {
      return { success: true, message: 'No new emails', ...results };
    }

    console.log(`Found ${fetchResult.emails.length} unread emails`);

    for (const emailData of fetchResult.emails) {
      try {
        const parsed = await parseRawEmail(emailData.rawEmail);

        if (!parsed || !parsed.from) {
          results.errors++;
          continue;
        }

        // Process the email
        const processResult = await emailParser.processEmail({
          senderEmail: parsed.from,
          subject: parsed.subject,
          body: parsed.text || parsed.html,
          imapMessageId: parsed.messageId || emailData.messageId
        });

        results.processed++;

        if (processResult.success) {
          if (processResult.status === 'AUTO_APPROVED') {
            results.autoApproved++;
            // Create order automatically
            await createOrderFromPending(processResult.orderId);
            // Send confirmation email
            await sendApprovalEmail(processResult);
          } else if (processResult.status === 'DUPLICATE_WARNING') {
            results.duplicates++;
          } else {
            results.pendingReview++;
          }
        } else {
          results.errors++;
          // Send clarification email for unparseable
          if (processResult.error === 'UNPARSEABLE') {
            await sendClarificationEmail(parsed.from, processResult.message);
          }
        }
      } catch (err) {
        console.error('Error processing email:', err);
        results.errors++;
      }
    }

    return { success: true, ...results };
  } catch (err) {
    console.error('Poll error:', err);
    return { success: false, error: err.message, ...results };
  } finally {
    isPolling = false;
  }
}

// Create order from auto-approved pending order
function createOrderFromPending(pendingOrderId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT po.*, p.price
      FROM pending_orders po
      LEFT JOIN products p ON po.product_id = p.id
      WHERE po.id = ?
    `, [pendingOrderId], (err, pendingOrder) => {
      if (err) return reject(err);
      if (!pendingOrder) return reject(new Error('Pending order not found'));

      // Find or create customer by email
      db.get('SELECT id FROM customers WHERE email = ?', [pendingOrder.sender_email], (err, customer) => {
        if (err) return reject(err);

        const createOrder = (customerId) => {
          // Create order
          db.run(`
            INSERT INTO orders (customer_id, order_date, status)
            VALUES (?, date('now'), 'created')
          `, [customerId], function(err) {
            if (err) return reject(err);

            const orderId = this.lastID;

            // Create order item
            db.run(`
              INSERT INTO order_items (order_id, product_id, quantity)
              VALUES (?, ?, ?)
            `, [orderId, pendingOrder.product_id, pendingOrder.extracted_quantity], (err) => {
              if (err) return reject(err);

              // Update pending order status
              db.run(`
                UPDATE pending_orders SET status = 'PROCESSED', approved_at = datetime('now')
                WHERE id = ?
              `, [pendingOrderId], (err) => {
                if (err) return reject(err);

                // Create invoice automatically
                const invoiceNumber = `INV-${Date.now()}`;
                const totalAmount = (pendingOrder.price || 0) * pendingOrder.extracted_quantity;

                db.run(`
                  INSERT INTO invoices (order_id, invoice_number, invoice_date, due_date, total_amount, status)
                  VALUES (?, ?, date('now'), date('now', '+30 days'), ?, 'sent')
                `, [orderId, invoiceNumber, totalAmount], function(err) {
                  if (err) return reject(err);

                  resolve({
                    orderId,
                    invoiceId: this.lastID,
                    invoiceNumber,
                    totalAmount
                  });
                });
              });
            });
          });
        };

        if (customer) {
          createOrder(customer.id);
        } else {
          // Create new customer
          db.run(`
            INSERT INTO customers (name, email)
            VALUES (?, ?)
          `, [pendingOrder.sender_email.split('@')[0], pendingOrder.sender_email], function(err) {
            if (err) return reject(err);
            createOrder(this.lastID);
          });
        }
      });
    });
  });
}

// Send approval confirmation email
async function sendApprovalEmail(orderData) {
  if (!smtpTransporter) {
    console.log('SMTP not configured, skipping approval email');
    return;
  }

  const mailOptions = {
    from: smtpConfig.auth.user,
    to: orderData.senderEmail,
    subject: `Bestellung bestaetigt #${orderData.orderId}`,
    html: `
      <h2>Bestellung bestaetigt</h2>
      <p>Vielen Dank fuer Ihre Email-Bestellung!</p>
      <table border="1" cellpadding="10" style="border-collapse: collapse;">
        <tr><td><strong>Bestellnummer:</strong></td><td>#${orderData.orderId}</td></tr>
        <tr><td><strong>Produkt:</strong></td><td>${orderData.productName}</td></tr>
        <tr><td><strong>Menge:</strong></td><td>${orderData.quantity}</td></tr>
        <tr><td><strong>Status:</strong></td><td>Genehmigt und verarbeitet</td></tr>
      </table>
      <p>Falls Sie Fragen haben, antworten Sie auf diese E-Mail.</p>
      <p>Beste Gruesse,<br>ERP System</p>
    `
  };

  try {
    await smtpTransporter.sendMail(mailOptions);
    console.log('Approval email sent to:', orderData.senderEmail);
  } catch (err) {
    console.error('Failed to send approval email:', err);
  }
}

// Send clarification request email
async function sendClarificationEmail(recipientEmail, errorMessage) {
  if (!smtpTransporter) {
    console.log('SMTP not configured, skipping clarification email');
    return;
  }

  const mailOptions = {
    from: smtpConfig.auth.user,
    to: recipientEmail,
    subject: 'Re: Bestellung - Manuelle Bearbeitung erforderlich',
    html: `
      <h2>Bestellung konnte nicht verarbeitet werden</h2>
      <p>Vielen Dank fuer Ihre Bestellung!</p>
      <p>Leider konnte Ihre Email nicht automatisch verarbeitet werden:</p>
      <p><strong>Grund:</strong> ${errorMessage}</p>
      <h3>Naechste Schritte:</h3>
      <ol>
        <li>Bitte antworten Sie auf diese Email mit den genauen Produktdetails</li>
        <li>Verwenden Sie das Format: "Ich moechte [Anzahl] [Produktname] bestellen"</li>
      </ol>
      <p>Beispiel: "Ich moechte 2 HP Laptop bestellen"</p>
      <p>Beste Gruesse,<br>ERP System</p>
    `
  };

  try {
    await smtpTransporter.sendMail(mailOptions);
    console.log('Clarification email sent to:', recipientEmail);
  } catch (err) {
    console.error('Failed to send clarification email:', err);
  }
}

// Send rejection email
async function sendRejectionEmail(recipientEmail, reason) {
  if (!smtpTransporter) {
    console.log('SMTP not configured, skipping rejection email');
    return { success: false, error: 'SMTP not configured' };
  }

  const mailOptions = {
    from: smtpConfig.auth.user,
    to: recipientEmail,
    subject: 'Bestellung abgelehnt',
    html: `
      <h2>Bestellung abgelehnt</h2>
      <p>Ihre Bestellung konnte leider nicht bearbeitet werden.</p>
      <p><strong>Grund:</strong> ${reason}</p>
      <p>Bitte kontaktieren Sie uns bei Fragen.</p>
      <p>Beste Gruesse,<br>ERP System</p>
    `
  };

  try {
    await smtpTransporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('Failed to send rejection email:', err);
    return { success: false, error: err.message };
  }
}

// Start polling interval (every 5 minutes)
function startPolling(intervalMinutes = 5) {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`Starting email polling every ${intervalMinutes} minutes`);

  // Initial poll
  pollEmails().then(result => {
    console.log('Initial poll result:', result);
  });

  // Set interval
  pollInterval = setInterval(() => {
    pollEmails().then(result => {
      console.log('Poll result:', result);
    });
  }, intervalMs);

  return { success: true, intervalMinutes };
}

// Stop polling
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Email polling stopped');
    return { success: true };
  }
  return { success: false, message: 'Not polling' };
}

// Get polling status
function getPollingStatus() {
  return {
    isPolling: !!pollInterval,
    imapConfigured: !!imapConfig,
    smtpConfigured: !!smtpConfig
  };
}

// Test IMAP connection
async function testImapConnection() {
  await loadConfig();

  if (!imapConfig) {
    return { success: false, error: 'IMAP not configured' };
  }

  return new Promise((resolve) => {
    const imap = new Imap(imapConfig);

    imap.once('ready', () => {
      imap.end();
      resolve({ success: true, message: 'IMAP connection successful' });
    });

    imap.once('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    imap.connect();
  });
}

// Test SMTP connection
async function testSmtpConnection() {
  await loadConfig();

  if (!smtpTransporter) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    await smtpTransporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  fetchUnreadEmails,
  pollEmails,
  startPolling,
  stopPolling,
  getPollingStatus,
  testImapConnection,
  testSmtpConnection,
  sendApprovalEmail,
  sendClarificationEmail,
  sendRejectionEmail,
  createOrderFromPending
};

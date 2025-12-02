// Email Parser Service - Phase 11b
// Multi-pattern parsing with confidence scoring, duplicate detection, and rate limiting

const db = require('../db');

// German number words to digits
const GERMAN_NUMBERS = {
  'ein': 1, 'eine': 1, 'eins': 1,
  'zwei': 2, 'zwo': 2,
  'drei': 3,
  'vier': 4,
  'fuenf': 5, 'fünf': 5,
  'sechs': 6,
  'sieben': 7,
  'acht': 8,
  'neun': 9,
  'zehn': 10,
  'elf': 11,
  'zwoelf': 12, 'zwölf': 12
};

// English number words to digits
const ENGLISH_NUMBERS = {
  'one': 1, 'a': 1, 'an': 1,
  'two': 2,
  'three': 3,
  'four': 4,
  'five': 5,
  'six': 6,
  'seven': 7,
  'eight': 8,
  'nine': 9,
  'ten': 10,
  'eleven': 11,
  'twelve': 12
};

// Parsing patterns with base confidence scores
const PARSING_PATTERNS = [
  {
    name: 'german_strict',
    pattern: /[Ii]ch\s+(?:möchte|moechte|will|brauche|benötige|benotige|hätte gern|haette gern)\s+(\d+)\s*[xX]?\s+(.+?)(?:\s+bestellen|\s+kaufen|\s+ordern|\.|!|\?|$)/i,
    baseConfidence: 0.95,
    qtyGroup: 1,
    productGroup: 2
  },
  {
    name: 'german_text_qty',
    pattern: /[Ii]ch\s+(?:möchte|moechte|will|brauche|benötige|benotige|hätte gern|haette gern)\s+(ein|eine|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn)\s+(.+?)(?:\.|!|\?|$)/i,
    baseConfidence: 0.85,
    qtyGroup: 1,
    productGroup: 2,
    qtyTransform: 'german'
  },
  {
    name: 'english_strict',
    pattern: /[Ii]\s+(?:need|want|would like|order|am ordering)\s+(\d+)\s+(.+?)(?:\.|!|\?|$)/i,
    baseConfidence: 0.90,
    qtyGroup: 1,
    productGroup: 2
  },
  {
    name: 'english_text_qty',
    pattern: /[Ii]\s+(?:need|want|would like|order)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+?)(?:\.|!|\?|$)/i,
    baseConfidence: 0.80,
    qtyGroup: 1,
    productGroup: 2,
    qtyTransform: 'english'
  },
  {
    name: 'number_first',
    pattern: /(\d+)\s*[xX]?\s+([A-Z][A-Za-z0-9\s\-]+?)(?:\.|!|\?|,|$)/,
    baseConfidence: 0.75,
    qtyGroup: 1,
    productGroup: 2
  },
  {
    name: 'please_order',
    pattern: /(?:bitte|please)\s+(?:bestellen|order)\s*:?\s*(\d+)\s*[xX]?\s+(.+?)(?:\.|!|\?|$)/i,
    baseConfidence: 0.85,
    qtyGroup: 1,
    productGroup: 2
  },
  {
    name: 'bestellung_colon',
    pattern: /[Bb]estellung\s*:?\s*(\d+)\s*[xX]?\s+(.+?)(?:\.|!|\?|$)/i,
    baseConfidence: 0.90,
    qtyGroup: 1,
    productGroup: 2
  }
];

// Normalize product name (remove plurals, standardize)
function normalizeProductName(raw) {
  if (!raw) return null;

  let normalized = raw.trim();

  // Remove common trailing words
  normalized = normalized.replace(/\s+(bitte|please|danke|thanks|asap)$/i, '');

  // Remove plural 's' at end (simple English plurals)
  if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
    normalized = normalized.slice(0, -1);
  }

  // Remove German plural 'en' or 'e' endings for common product words
  normalized = normalized.replace(/(en|e)$/, '');

  // Trim and normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  if (!a || !b) return Infinity;

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;

  const matrix = [];

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower.charAt(i - 1) === aLower.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[bLower.length][aLower.length];
}

// Find best product match from database
function findProductMatch(extractedName) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, name FROM products', [], (err, products) => {
      if (err) {
        return reject(err);
      }

      if (!products || products.length === 0) {
        return resolve({ product: null, matchType: 'no_products' });
      }

      const normalizedExtracted = normalizeProductName(extractedName);
      if (!normalizedExtracted) {
        return resolve({ product: null, matchType: 'invalid_name' });
      }

      // Try exact match first (case-insensitive)
      const exactMatch = products.find(p =>
        p.name.toLowerCase() === normalizedExtracted.toLowerCase()
      );

      if (exactMatch) {
        return resolve({
          product: exactMatch,
          matchType: 'exact',
          confidenceModifier: 0
        });
      }

      // Try contains match
      const containsMatch = products.find(p =>
        p.name.toLowerCase().includes(normalizedExtracted.toLowerCase()) ||
        normalizedExtracted.toLowerCase().includes(p.name.toLowerCase())
      );

      if (containsMatch) {
        return resolve({
          product: containsMatch,
          matchType: 'contains',
          confidenceModifier: -0.05
        });
      }

      // Try fuzzy match (Levenshtein distance)
      let bestMatch = null;
      let bestDistance = Infinity;

      for (const product of products) {
        const distance = levenshteinDistance(normalizedExtracted, product.name);
        const maxLen = Math.max(normalizedExtracted.length, product.name.length);
        const similarity = 1 - (distance / maxLen);

        if (distance < bestDistance && similarity > 0.6) {
          bestDistance = distance;
          bestMatch = product;
        }
      }

      if (bestMatch) {
        return resolve({
          product: bestMatch,
          matchType: 'fuzzy',
          confidenceModifier: -0.15
        });
      }

      resolve({ product: null, matchType: 'no_match' });
    });
  });
}

// Parse email body and extract order data
async function parseEmailBody(body) {
  if (!body || typeof body !== 'string') {
    return {
      success: false,
      errorType: 'UNPARSEABLE',
      errorMessage: 'Empty or invalid email body'
    };
  }

  // Clean body text
  const cleanBody = body
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  // Try each pattern
  for (const patternConfig of PARSING_PATTERNS) {
    const match = cleanBody.match(patternConfig.pattern);

    if (match) {
      let quantity = match[patternConfig.qtyGroup];
      const rawProduct = match[patternConfig.productGroup];

      // Transform text quantity if needed
      if (patternConfig.qtyTransform === 'german') {
        quantity = GERMAN_NUMBERS[quantity.toLowerCase()] || parseInt(quantity, 10);
      } else if (patternConfig.qtyTransform === 'english') {
        quantity = ENGLISH_NUMBERS[quantity.toLowerCase()] || parseInt(quantity, 10);
      } else {
        quantity = parseInt(quantity, 10);
      }

      if (isNaN(quantity) || quantity <= 0 || quantity > 9999) {
        continue; // Invalid quantity, try next pattern
      }

      // Find product match
      const productMatch = await findProductMatch(rawProduct);

      let confidence = patternConfig.baseConfidence;
      let productId = null;
      let productName = rawProduct.trim();

      if (productMatch.product) {
        productId = productMatch.product.id;
        productName = productMatch.product.name;
        confidence += (productMatch.confidenceModifier || 0);
      } else {
        // No product match - reduce confidence significantly
        confidence -= 0.30;
      }

      // Ensure confidence is within bounds
      confidence = Math.max(0, Math.min(1, confidence));

      return {
        success: true,
        quantity,
        productName,
        productId,
        confidence,
        patternUsed: patternConfig.name,
        rawExtracted: rawProduct
      };
    }
  }

  return {
    success: false,
    errorType: 'UNPARSEABLE',
    errorMessage: 'No matching pattern found in email'
  };
}

// Check for duplicate orders (same sender + product + 24h)
function checkDuplicate(senderEmail, productId, quantity) {
  return new Promise((resolve, reject) => {
    if (!productId) {
      return resolve({ isDuplicate: false });
    }

    db.get(`
      SELECT id, created_at FROM pending_orders
      WHERE sender_email = ?
      AND product_id = ?
      AND extracted_quantity = ?
      AND created_at > datetime('now', '-1 day')
      AND status NOT IN ('REJECTED')
    `, [senderEmail, productId, quantity], (err, row) => {
      if (err) {
        return reject(err);
      }

      if (row) {
        resolve({ isDuplicate: true, originalOrderId: row.id, originalDate: row.created_at });
      } else {
        resolve({ isDuplicate: false });
      }
    });
  });
}

// Check rate limit for sender
function checkRateLimit(senderEmail) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM email_rate_limits WHERE sender_email = ?',
      [senderEmail],
      (err, limit) => {
        if (err) {
          return reject(err);
        }

        const now = Date.now();
        const minuteAgo = now - 60000;

        if (!limit) {
          // First request from this sender
          db.run(`
            INSERT INTO email_rate_limits (sender_email, parse_count_this_minute, last_reset)
            VALUES (?, 1, datetime('now'))
          `, [senderEmail], (err) => {
            if (err) return reject(err);
            resolve({ allowed: true, count: 1 });
          });
          return;
        }

        const lastReset = new Date(limit.last_reset).getTime();

        if (lastReset < minuteAgo) {
          // Reset counter (minute passed)
          db.run(`
            UPDATE email_rate_limits
            SET parse_count_this_minute = 1, last_reset = datetime('now'), is_throttled = 0
            WHERE sender_email = ?
          `, [senderEmail], (err) => {
            if (err) return reject(err);
            resolve({ allowed: true, count: 1 });
          });
          return;
        }

        // Check if over limit (5 per minute)
        if (limit.parse_count_this_minute >= 5) {
          db.run(
            'UPDATE email_rate_limits SET is_throttled = 1 WHERE sender_email = ?',
            [senderEmail]
          );
          resolve({
            allowed: false,
            count: limit.parse_count_this_minute,
            message: 'Rate limit exceeded (max 5 per minute)'
          });
          return;
        }

        // Increment counter
        db.run(`
          UPDATE email_rate_limits
          SET parse_count_this_minute = parse_count_this_minute + 1
          WHERE sender_email = ?
        `, [senderEmail], (err) => {
          if (err) return reject(err);
          resolve({ allowed: true, count: limit.parse_count_this_minute + 1 });
        });
      }
    );
  });
}

// Store parsed email in database
function storeParsedEmail(email) {
  return new Promise((resolve, reject) => {
    const { senderEmail, subject, rawBody, status, errorMessage, imapMessageId, duplicateOf } = email;

    db.run(`
      INSERT INTO parsed_emails (sender_email, subject, raw_body, status, error_message, imap_message_id, duplicate_of)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [senderEmail, subject, rawBody, status, errorMessage, imapMessageId, duplicateOf], function(err) {
      if (err) {
        return reject(err);
      }
      resolve({ id: this.lastID });
    });
  });
}

// Store pending order in database
function storePendingOrder(order) {
  return new Promise((resolve, reject) => {
    const {
      parsedEmailId, senderEmail, extractedQuantity, extractedProductName,
      productId, confidenceScore, status
    } = order;

    db.run(`
      INSERT INTO pending_orders
      (parsed_email_id, sender_email, extracted_quantity, extracted_product_name, product_id, confidence_score, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [parsedEmailId, senderEmail, extractedQuantity, extractedProductName, productId, confidenceScore, status], function(err) {
      if (err) {
        return reject(err);
      }
      resolve({ id: this.lastID });
    });
  });
}

// Store parsing error
function storeParsingError(error) {
  return new Promise((resolve, reject) => {
    const { senderEmail, rawBody, errorType, errorMessage } = error;

    // Check if similar error already exists
    db.get(`
      SELECT id, parse_attempt_count FROM email_parsing_errors
      WHERE sender_email = ? AND error_type = ?
      AND created_at > datetime('now', '-1 day')
    `, [senderEmail, errorType], (err, existing) => {
      if (err) return reject(err);

      if (existing) {
        // Update attempt count
        db.run(`
          UPDATE email_parsing_errors
          SET parse_attempt_count = parse_attempt_count + 1
          WHERE id = ?
        `, [existing.id], (err) => {
          if (err) return reject(err);
          resolve({ id: existing.id, updated: true });
        });
      } else {
        // Insert new error
        db.run(`
          INSERT INTO email_parsing_errors (sender_email, raw_body, error_type, error_message)
          VALUES (?, ?, ?, ?)
        `, [senderEmail, rawBody, errorType, errorMessage], function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, updated: false });
        });
      }
    });
  });
}

// Main processing function
async function processEmail(email) {
  const { senderEmail, subject, body, imapMessageId } = email;
  const AUTO_APPROVE_THRESHOLD = 0.80;

  try {
    // Check rate limit
    const rateLimit = await checkRateLimit(senderEmail);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: rateLimit.message
      };
    }

    // Parse email body
    const parseResult = await parseEmailBody(body);

    if (!parseResult.success) {
      // Store error
      await storeParsingError({
        senderEmail,
        rawBody: body,
        errorType: parseResult.errorType,
        errorMessage: parseResult.errorMessage
      });

      // Store parsed email with error status
      await storeParsedEmail({
        senderEmail,
        subject,
        rawBody: body,
        status: 'ERROR',
        errorMessage: parseResult.errorMessage,
        imapMessageId
      });

      return {
        success: false,
        error: parseResult.errorType,
        message: parseResult.errorMessage
      };
    }

    // Check for duplicates
    const duplicateCheck = await checkDuplicate(
      senderEmail,
      parseResult.productId,
      parseResult.quantity
    );

    let emailStatus = 'PARSED';
    let duplicateOf = null;

    if (duplicateCheck.isDuplicate) {
      emailStatus = 'DUPLICATE';
      duplicateOf = duplicateCheck.originalOrderId;
    }

    // Store parsed email
    const storedEmail = await storeParsedEmail({
      senderEmail,
      subject,
      rawBody: body,
      status: emailStatus,
      imapMessageId,
      duplicateOf
    });

    // Determine order status based on confidence
    let orderStatus = 'PENDING_REVIEW';
    if (parseResult.confidence >= AUTO_APPROVE_THRESHOLD && !duplicateCheck.isDuplicate) {
      orderStatus = 'AUTO_APPROVED';
    } else if (duplicateCheck.isDuplicate) {
      orderStatus = 'DUPLICATE_WARNING';
    }

    // Store pending order
    const storedOrder = await storePendingOrder({
      parsedEmailId: storedEmail.id,
      senderEmail,
      extractedQuantity: parseResult.quantity,
      extractedProductName: parseResult.productName,
      productId: parseResult.productId,
      confidenceScore: parseResult.confidence,
      status: orderStatus
    });

    return {
      success: true,
      orderId: storedOrder.id,
      emailId: storedEmail.id,
      quantity: parseResult.quantity,
      productName: parseResult.productName,
      productId: parseResult.productId,
      confidence: parseResult.confidence,
      status: orderStatus,
      isDuplicate: duplicateCheck.isDuplicate,
      duplicateOf: duplicateCheck.originalOrderId
    };

  } catch (err) {
    console.error('Email processing error:', err);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
      message: err.message
    };
  }
}

module.exports = {
  parseEmailBody,
  processEmail,
  checkDuplicate,
  checkRateLimit,
  findProductMatch,
  normalizeProductName,
  storeParsedEmail,
  storePendingOrder,
  storeParsingError,
  AUTO_APPROVE_THRESHOLD: 0.80
};

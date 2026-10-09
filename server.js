const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1); // Traefik (Coolify) davor

// ─── Kanonische Domain: www. → Apex (301) ───
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.startsWith('www.')) {
    return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  }
  next();
});

// ─── Security-Header ───
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false, preload: false },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'sameorigin' },
  crossOriginEmbedderPolicy: false,
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '20kb' }));

// ─── Statische Dateien (nur public/) ───
app.use(express.static(PUBLIC_DIR, {
  dotfiles: 'ignore',
  index: 'index.html',
  extensions: ['html'],
  cacheControl: false,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', /\.html?$/.test(filePath)
      ? 'no-cache'
      : 'public, max-age=2592000');
  },
}));

// ─── Mailversand ───
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  user: process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.BREVO_USER,
  pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.BREVO_PASS,
  apiKey: process.env.BREVO_API_KEY || process.env.BREVO_TRANSACTIONAL_API_KEY,
  from: process.env.MAIL_FROM || process.env.SMTP_FROM || 'info@hakolli.de',
  fromName: process.env.MAIL_FROM_NAME || 'Hakolli Gartenbau Website',
  to: process.env.MAIL_TO || 'info@hakolli.de',
  dryRun: String(process.env.MAIL_DRY_RUN || '').toLowerCase() === 'true',
};

const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass,
  },
});

console.log('Mail settings:', {
  host: smtpConfig.host,
  port: smtpConfig.port,
  userConfigured: Boolean(smtpConfig.user),
  passConfigured: Boolean(smtpConfig.pass),
  apiKeyConfigured: Boolean(smtpConfig.apiKey),
  from: smtpConfig.from,
  to: smtpConfig.to,
  dryRun: smtpConfig.dryRun,
});

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Keine Zeilenumbrüche in Werten, die in Betreff/Mail-Header landen
function singleLine(value = '') {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function buildEmail({ name, phone, email, service, message }) {
  return {
    subject: `Neue Anfrage: ${singleLine(service) || 'Allgemein'} - ${singleLine(name)}`,
    html: `
      <h2>Neue Kontaktanfrage ueber hakolli.de</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
        <tr><td><strong>E-Mail</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td><strong>Telefon</strong></td><td>${escapeHtml(phone || '-')}</td></tr>
        <tr><td><strong>Leistung</strong></td><td>${escapeHtml(service || '-')}</td></tr>
        <tr><td><strong>Nachricht</strong></td><td style="white-space:pre-wrap">${escapeHtml(message || '-')}</td></tr>
      </table>
    `,
  };
}

async function sendWithBrevoApi(data) {
  const emailContent = buildEmail(data);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': smtpConfig.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: smtpConfig.fromName,
        email: smtpConfig.from,
      },
      to: [{ email: smtpConfig.to }],
      replyTo: { email: data.email, name: singleLine(data.name) },
      subject: emailContent.subject,
      htmlContent: emailContent.html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Brevo API error: ${response.status} ${details}`);
    error.code = `BREVO_API_${response.status}`;
    throw error;
  }
}

async function sendWithSmtp(data) {
  const emailContent = buildEmail(data);
  await transporter.sendMail({
    from: { name: smtpConfig.fromName, address: smtpConfig.from },
    replyTo: { name: singleLine(data.name), address: data.email },
    to: smtpConfig.to,
    subject: emailContent.subject,
    html: emailContent.html,
  });
}

// ─── Kontaktformular ───
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const MIN_FILL_MS = 3000;
const LIMITS = { name: 100, email: 200, phone: 50, service: 100, message: 5000 };

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut oder rufen Sie uns an.' },
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  const body = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const data = {
    name: str(body.name),
    email: str(body.email),
    phone: str(body.phone),
    service: str(body.service),
    message: str(body.message),
  };

  // Spam-Schutz: Honeypot oder zu schnell ausgefüllt → still verwerfen
  const startedAt = Number(body._ts);
  if (str(body.website) || !startedAt || Date.now() - startedAt < MIN_FILL_MS) {
    console.warn('Kontaktformular: Spam verworfen', { ip: req.ip });
    return res.json({ success: true });
  }

  if (!data.name || !data.email) {
    return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  }
  if (!EMAIL_RE.test(data.email)) {
    return res.status(400).json({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' });
  }
  for (const [field, max] of Object.entries(LIMITS)) {
    if (data[field].length > max) {
      return res.status(400).json({ error: 'Eine Eingabe ist zu lang.' });
    }
  }

  if (smtpConfig.dryRun) {
    const { subject, html } = buildEmail(data);
    console.log('[MAIL_DRY_RUN] Mail nicht gesendet:', { to: smtpConfig.to, subject, html });
    return res.json({ success: true });
  }

  if (!smtpConfig.apiKey && (!smtpConfig.user || !smtpConfig.pass)) {
    console.error('Mail config missing: set BREVO_API_KEY or SMTP_USER and SMTP_PASS in Coolify.');
    return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden. Bitte rufen Sie uns an.' });
  }

  try {
    if (smtpConfig.apiKey) {
      await sendWithBrevoApi(data);
    } else {
      await sendWithSmtp(data);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Mail error:', {
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
      message: err.message,
    });
    res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden. Bitte rufen Sie uns an.' });
  }
});

// Ungültiges JSON / zu große Anfrage → generische Meldung, keine Details
app.use((err, req, res, next) => {
  console.error('Request error:', err.type || err.message);
  res.status(err.status || 500).json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' });
});

// ─── 404 ───
app.use((req, res) => {
  res.status(404).setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server laeuft auf Port ${PORT}`));

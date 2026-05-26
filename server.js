const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

console.log('SMTP settings:', {
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  userConfigured: Boolean(smtpConfig.user),
  passConfigured: Boolean(smtpConfig.pass),
  apiKeyConfigured: Boolean(smtpConfig.apiKey),
  from: smtpConfig.from,
  to: smtpConfig.to,
});

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmail({ name, phone, email, service, message }) {
  return {
    subject: `Neue Anfrage: ${service || 'Allgemein'} - ${name}`,
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

async function sendWithBrevoApi({ name, phone, email, service, message }) {
  const emailContent = buildEmail({ name, phone, email, service, message });
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
      replyTo: { email, name },
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

async function sendWithSmtp({ name, phone, email, service, message }) {
  const emailContent = buildEmail({ name, phone, email, service, message });
  await transporter.sendMail({
    from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
    replyTo: `"${escapeHtml(name)}" <${email}>`,
    to: smtpConfig.to,
    subject: emailContent.subject,
    html: emailContent.html,
  });
}

app.post('/api/contact', async (req, res) => {
  const { name, phone, email, service, message } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  }

  if (!smtpConfig.apiKey && (!smtpConfig.user || !smtpConfig.pass)) {
    console.error('Mail config missing: set BREVO_API_KEY or SMTP_USER and SMTP_PASS in Coolify.');
    return res.status(500).json({ error: 'Mailversand ist nicht konfiguriert.' });
  }

  try {
    if (smtpConfig.apiKey) {
      await sendWithBrevoApi({ name, phone, email, service, message });
    } else {
      await sendWithSmtp({ name, phone, email, service, message });
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
    res.status(500).json({
      error: 'E-Mail konnte nicht gesendet werden.',
      code: err.code || err.responseCode || 'SMTP_ERROR',
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server laeuft auf Port ${PORT}`));

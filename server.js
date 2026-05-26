const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

app.post('/api/contact', async (req, res) => {
  const { name, phone, email, service, message } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  }

  try {
    await transporter.sendMail({
      from: `"Hakolli Gartenbau Website" <${process.env.BREVO_USER}>`,
      replyTo: `"${name}" <${email}>`,
      to: 'info@hakolli.de',
      subject: `Neue Anfrage: ${service || 'Allgemein'} – ${name}`,
      html: `
        <h2>Neue Kontaktanfrage über hakolli.de</h2>
        <table cellpadding="8" style="border-collapse:collapse;width:100%">
          <tr><td><strong>Name</strong></td><td>${name}</td></tr>
          <tr><td><strong>E-Mail</strong></td><td>${email}</td></tr>
          <tr><td><strong>Telefon</strong></td><td>${phone || '—'}</td></tr>
          <tr><td><strong>Leistung</strong></td><td>${service || '—'}</td></tr>
          <tr><td><strong>Nachricht</strong></td><td style="white-space:pre-wrap">${message || '—'}</td></tr>
        </table>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Mail error:', err);
    res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

#!/usr/bin/env node
/*
 * Erzeugt optimierte Web-Bilder aus originals/ nach public/img/.
 * Pro Bild: <name>.webp (max. 1920 px), <name>-1200.webp, <name>-800.webp
 * und <name>.jpg (1200 px, Fallback fuer Browser ohne WebP).
 * Aufruf: npm run images
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'originals');
const OUT = path.join(__dirname, '..', 'public', 'img');
const QUALITY = 75;

// Originaldatei -> sprechender Dateiname (ohne Endung)
const IMAGES = {
  'WhatsApp Image 2026-05-15 at 22.05.4798.jpeg': 'pool-abendbeleuchtung-buehl',
  'WhatsApp Image 2026-05-15 at 22.05.4699.jpeg': 'pool-gartenanlage-tagansicht',
  'WhatsApp Image 2026-05-18 at 15.11.27 (2).jpeg': 'terrasse-sandstein-natursteinplatten',
  'WhatsApp Image 2026-05-18 at 15.11.27 (3).jpeg': 'terrasse-polygonalplatten-rot',
  'WhatsApp Image 2026-05-18 at 15.11.28.jpeg': 'terrasse-polygonalplatten-detail',
  'WhatsApp Image 2026-05-18 at 15.11.29 (2).jpeg': 'terrasse-natursteinstuetzmauer',
  '1.jpeg': 'granitpflaster-vorplatz',
  '2.jpeg': 'kopfsteinpflaster-einfahrt',
  '9.jpeg': 'granitpflaster-stufen',
  '45.jpeg': 'pool-gartenhaus',
  '66.jpeg': 'pflastereinfahrt-wohnanlage',
  '98.jpeg': 'team-erdarbeiten',
  'treppe.jpeg': 'granit-eingangstreppe-neubau',
  'pool.jpeg': 'pool-holzdeck',
  'poolvorhernacher.jpeg': 'pool-vorher-nachher',
  'pflaster.jpeg': 'pflastereinfahrt',
  'WhatsAp.jpeg': 'pflaster-anthrazit-modern',
  'WhatsApp Image 2026-05-15 at .jpeg': 'sandsteintreppe',
  'WhatsApp Image 2026-05-15 at 223.jpeg': 'poolbau-villa',
  'WhatsApp Image 2026-05-15 at 22.05.46.jpeg': 'gabione-sichtschutz',
  'WhatsApp Image 2026-05-15 at 22.05.4611.jpeg': 'pool-mit-gartenanlage',
  'WhatsApp Image 2026-05-15 at 22.05.4612.jpeg': 'naturpool',
  'WhatsApp Image 2026-05-15 at 22.05.4613.jpeg': 'einfahrt-mit-mauer',
  'WhatsApp Image 2026-05-15 at 22.05.462.jpeg': 'pflaster-und-garten',
  'WhatsApp Image 2026-05-15 at 22.05.463.jpeg': 'holzterrasse-vorher-nachher',
  'WhatsApp Image 2026-05-15 at 22.05.464.jpeg': 'granittreppe-schwarz',
  'WhatsApp Image 2026-05-15 at 22.05.4666.jpeg': 'natursteinmauer',
  'WhatsApp Image 2026-05-15 at 22.05.46666.jpeg': 'gartenanlage-mit-pool',
  'WhatsApp Image 2026-05-15 at 22.05.4724.jpeg': 'sichtschutzwand',
  'WhatsApp Image 2026-05-15 at 22.05.4755.jpeg': 'premium-pool',
  'WhatsApp Image 2026-05-15 at 22.05.476666.jpeg': 'pool-draufsicht',
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {};
  for (const [file, name] of Object.entries(IMAGES)) {
    const input = sharp(path.join(SRC, file)).rotate();
    const webp = { quality: QUALITY, effort: 6, smartSubsample: true };
    const info = await input.clone().resize({ width: 1920, withoutEnlargement: true })
      .webp(webp).toFile(path.join(OUT, `${name}.webp`));
    for (const width of [1200, 800]) {
      await input.clone().resize({ width, withoutEnlargement: true })
        .webp(webp).toFile(path.join(OUT, `${name}-${width}.webp`));
    }
    await input.clone().resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));
    manifest[name] = { width: info.width, height: info.height };
    console.log(`${name}: ${info.width}x${info.height}`);
  }
  fs.writeFileSync(path.join(__dirname, 'images.json'), JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });

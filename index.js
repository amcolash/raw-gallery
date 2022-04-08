const express = require('express');
const { join, dirname, resolve } = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { mkdir, access } = require('fs/promises');
const glob = require('glob');
const { existsSync } = require('fs');

console.log(`All args: ${process.argv}`);

const importDir = '/media/sdb1/SD Card Imports/';

const inDir = existsSync(importDir) ? importDir : process.argv[2] || join(__dirname, 'test');
const outDir = process.argv[3] || join(__dirname, 'tmp');

let processing = false;

const CronJob = require('cron').CronJob;
const job = new CronJob(
  '*/15 * * * *',
  function () {
    console.log(`${new Date().toLocaleString()}: Scheduled cron processing`);

    processDir(inDir, outDir);
  },
  null,
  true,
  'America/Los_Angeles',
  null,
  true
);

// setTimeout(() => job.start(), 15 * 60 * 1000);

const PORT = process.env.PORT || 8080;

const app = new express();
app.listen(PORT);
app.get('/', (req, res) => {
  res.send('A-Ok');
});

async function processDir(inDir, outDir) {
  if (processing) {
    console.log('Already processing, skipping invocation');
    return;
  }

  processing = true;

  try {
    console.log(`Processing files inside ${inDir}`);

    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    console.log('Getting file list, this might take some time...\n');
    const files = glob.sync(inDir + '/**/*.CR2');

    let estTime = '???';
    let avg = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.toLowerCase().indexOf('.cr2') !== -1) {
        const progress = `${(((i + 1) / files.length) * 100).toFixed(1)}% [${i + 1}/${files.length}] (est ${estTime})`;
        const start = Date.now();

        console.log(`${progress} ${f}`);

        await generatePreview(f);
        await generateThumbnail(f);

        const diff = (Date.now() - start) * (files.length - i);
        if (estTime === '???') avg = diff;
        else avg = 0.95 * avg + 0.05 * diff;

        estTime = new Date(avg).toISOString().substring(11, 19);
      }
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\nProcessing Complete!');
  processing = false;
}

async function generatePreview(f) {
  const previewFile = resolve(f.replace('.CR2', '.jpg').replace(inDir, outDir + '/previews/'));

  try {
    await access(previewFile);
    console.log(`  + ${previewFile}`);
  } catch (err) {
    try {
      const command = `exiftool -b -PreviewImage -w "${dirname(previewFile)}/\%f.jpg" "${f}"`;
      await exec(command);

      console.log(`  + ${previewFile}`);
    } catch (err) {
      console.log(`  x ${previewFile}`);
      // console.error(err);
    }
  }
}

async function generateThumbnail(f) {
  const previewFile = resolve(f.replace('.CR2', '.jpg').replace(inDir, outDir + '/previews/'));
  const thumbFile = resolve(previewFile.replace(outDir + '/previews/', outDir + '/thumbnails/'));

  try {
    await access(thumbFile);
    console.log(`  + ${thumbFile}`);
  } catch (err) {
    // Just in case, make the output dir
    await mkdir(dirname(thumbFile), { recursive: true });

    try {
      const command = `vipsthumbnail "${previewFile}" --size x300 -o "${dirname(thumbFile)}/\%s.jpg"`;
      await exec(command);

      console.log(`  + ${thumbFile}`);
    } catch (err) {
      console.log(`  x ${thumbFile}`);
      // console.error(err);
    }
  }
}

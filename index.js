const express = require('express');
const { join, dirname } = require('path');
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

    console.log('Getting file list, this might take some time...');
    const files = glob.sync(inDir + '/**/*.CR2');

    let estTime = '???';
    let avg = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.toLowerCase().indexOf('.cr2') !== -1) {
        const outFile = f.replace('.CR2', '.jpg').replace(inDir, outDir + '/previews/');

        const progress = `${(((i + 1) / files.length) * 100).toFixed(1)}% [${i + 1}/${files.length}] (est ${estTime})`;
        try {
          await access(outFile);
          console.log(`${progress} + ${f}`);
        } catch (err) {
          try {
            const command = `exiftool -b -PreviewImage -w "${dirname(outFile)}/\%f.jpg" "${f}"`;
            // console.log(command, '\n', dirname(outFile));

            if (process.stdout.clearLine) process.stdout.write(`${progress} ? ${f}`);

            let start = Date.now();
            await exec(command);

            const diff = (Date.now() - start) * (files.length - i);
            if (estTime === '???') avg = diff;
            else avg = 0.95 * avg + 0.05 * diff;

            estTime = new Date(avg).toISOString().substring(11, 19);

            if (process.stdout.clearLine) {
              process.stdout.clearLine(0);
              process.stdout.cursorTo(0);
              process.stdout.write(`${progress} + ${f}\n`);
            } else console.log(`${progress} + ${f}`);
          } catch (err) {
            if (process.stdout.clearLine) {
              process.stdout.clearLine(0);
              process.stdout.cursorTo(0);
              process.stdout.write(`${progress} x ${f}\n`);
            } else console.log(`${progress} x ${f}`);

            console.error(err);
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  console.log('Processing Complete!');
  processing = false;
}

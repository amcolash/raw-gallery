const express = require('express');
const { join, dirname, relative, resolve, extname } = require('path');
const { mkdir, access, readdir, readFile, writeFile } = require('fs/promises');
const glob = require('glob');
const { existsSync } = require('fs');
const cr2Raw = require('cr2-raw');
const piexif = require('piexifjs');
const exifr = require('exifr');

console.log(`All args: ${process.argv}`);

const importDir = '/media/sdb1/SD Card Imports/';

const inDir = existsSync(importDir) ? importDir : process.argv[2] || join(__dirname, 'test');
const outDir = process.argv[3] || join(__dirname, 'tmp');
const debug = process.env.DEBUG !== undefined;

let rootDirs = [];
let fileList = [];
let processing = false;
let progress;

const CronJob = require('cron').CronJob;
const job = new CronJob(
  '*/5 * * * *',
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

const PORT = process.env.PORT || 8080;

const app = new express();
app.listen(PORT);
app.use(express.static('public'));
app.use('/images', express.static(outDir));

app.get('/imagelist', (req, res) => {
  const page = Math.max(1, req.query.page || 1);
  const limit = 50;
  const filter = req.query.filter;

  const start = (page - 1) * limit;
  const end = page * limit;

  const filtered = filter ? Object.values(fileList).filter((f) => f.preview.indexOf(filter) !== -1) : Object.values(fileList);

  const results = {
    start,
    end,
    pages: Math.ceil(filtered.length / limit),
    progress,
    images: filtered.slice(start, end),
    rootDirs,
  };

  res.send(results);
});

app.get('/progress', (req, res) => {
  res.send(progress);
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

    // Generate served file list, it is in reverse sorted order which is good with me and my file structure
    fileList = {};
    files.reverse().forEach((f) => {
      fileList[f] = { preview: relative(outDir, getPreviewFile(f)), thumbnail: relative(outDir, getThumbnailFile(f)) };
    });

    rootDirs = (await readdir(inDir)).filter((f) => extname(f) === '').reverse();

    console.log(`Starting batch processing of ${files.length} files\n`);

    let estTime = '???';
    let avg = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.toLowerCase().indexOf('.cr2') !== -1) {
        progress = `${(((i + 1) / files.length) * 100).toFixed(1)}% [${i + 1}/${files.length}] (est ${estTime})`;
        const start = Date.now();

        const exif = fileList[f].meta || (await getMetadata(f));

        const previewInfo = await generatePreview(f, undefined, exif);
        const thumbnailInfo = await generateThumbnail(f, previewInfo.raw, exif);

        if (!previewInfo.exists || !thumbnailInfo.exists || debug || !process.stdout.clearLine) console.log(`${progress} ${f}`);
        else process.stdout.write('.');

        if (!previewInfo.exists || debug) console.log(previewInfo.info);
        if (!thumbnailInfo.exists || debug) console.log(thumbnailInfo.info);

        const diff = (Date.now() - start) * (files.length - i);
        if (estTime === '???') avg = diff;
        else avg = 0.95 * avg + 0.05 * diff;

        if (!previewInfo.exists || !thumbnailInfo.exists || debug) console.log(`  Processing took [${Date.now() - start}ms]`);

        estTime = new Date(avg).toISOString().substring(11, 19);
      }
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\nProcessing Complete!');
  processing = false;
  progress = undefined;
}

function getPreviewFile(f) {
  const previewFile = resolve(f.replace('.CR2', '.jpg').replace(inDir, outDir + '/previews/'));

  return previewFile;
}

function getThumbnailFile(f) {
  const previewFile = getPreviewFile(f);
  const thumbFile = resolve(previewFile.replace(outDir + '/previews/', outDir + '/thumbnails/'));

  return thumbFile;
}

async function generatePreview(f, raw, exif) {
  const previewFile = getPreviewFile(f);

  let exists = false;
  let info = '';
  try {
    await access(previewFile);

    exists = true;
    info = `  + ${previewFile}`;
  } catch (err) {
    try {
      // Just in case, make the output dir
      await mkdir(dirname(previewFile), { recursive: true });

      if (!raw) raw = cr2Raw(f);

      const modifiedPreview = piexif.insert(exif, raw.previewImage().toString('binary'));
      await writeFile(previewFile, modifiedPreview, { encoding: 'binary' });

      info = `  + ${previewFile}`;
    } catch (err) {
      info = `  x ${previewFile}`;
      console.error(err);
    }
  }

  return { exists, info, raw };
}

async function generateThumbnail(f, raw, exif) {
  const thumbFile = getThumbnailFile(f);

  let exists = false;
  let info = '';
  try {
    await access(thumbFile);
    exists = true;
    info = `  + ${thumbFile}`;
  } catch (err) {
    try {
      // Just in case, make the output dir
      await mkdir(dirname(thumbFile), { recursive: true });

      if (!raw) raw = cr2Raw(f);

      const modifiedThumb = piexif.insert(exif, raw.thumbnailImage().toString('binary'));
      await writeFile(thumbFile, modifiedThumb, { encoding: 'binary' });

      info = `  + ${thumbFile}`;
    } catch (err) {
      info = `  x ${thumbFile}`;
      console.error(err);
    }
  }

  return { exists, info };
}

async function getMetadata(f) {
  const meta = await exifr.parse(f, { pick: ['Orientation', 'DateTimeOriginal'], translateValues: false });
  fileList[f].meta = meta;

  const exifObj = {
    '0th': {
      [piexif.ImageIFD.Orientation]: meta.Orientation,
    },
    exif: {
      [piexif.ImageIFD.DateTime]: meta.DateTimeOriginal,
    },
  };

  const exifBytes = piexif.dump(exifObj);

  return exifBytes;
}

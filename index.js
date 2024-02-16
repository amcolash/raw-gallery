const express = require('express');
const { join, dirname, relative, resolve, extname } = require('path');
const { mkdir, access, readdir, readFile, writeFile } = require('fs/promises');
const glob = require('glob');
const { existsSync } = require('fs');
const cr2Raw = require('cr2-raw');
const piexif = require('piexifjs');
const exifr = require('exifr');
const { execSync } = require('child_process');

console.log(`All args: ${process.argv}`);

const importDir = '/media/sdb1/SD Card Imports/';

const inDir = existsSync(importDir) ? importDir : process.argv[2] || join(__dirname, 'test');
const outDir = process.argv[3] || join(__dirname, 'tmp');
const metadataFile = join(outDir, '/data.json');
const debug = process.env.DEBUG !== undefined;

let rootDirs = [];
let fileList = {};
let processing = false;
let progress;
let metadata = loadMetadata();
let metadataCounter = 0;

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

console.log(`Starting server on http://localhost:${PORT}`);
const app = new express();
app.listen(PORT);
app.use(express.static('public'));
app.use('/images', express.static(outDir));
app.use('/raw', express.static(inDir));

app.get('/imagelist', (req, res) => {
  const page = Math.max(1, req.query.page || 1);
  const limit = 50;
  const filter = req.query.filter;

  const start = (page - 1) * limit;
  const end = Math.min(page * limit, Object.values(fileList).length - 1);

  const sorted = Object.values(fileList).sort((a, b) => b.preview.localeCompare(a.preview));
  const filtered = filter ? sorted.filter((f) => f.preview.indexOf(filter) !== -1) : sorted;

  const results = {
    start,
    end,
    pages: Math.ceil(filtered.length / limit),
    progress,
    images: filtered.slice(start, end + 1).map((i) => {
      return { ...i, meta: metadata[i.raw] };
    }),
    hasMore: end !== Object.values(fileList).length - 1,
    rootDirs,
  };

  res.send(results);
});

app.get('/progress', (req, res) => {
  res.send({ progress, processing });
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
    const photos = glob.sync(inDir + '/**/*.cr2', { nocase: true });
    const videos = glob.sync(inDir + '/**/*.{mp4,mov}', { nocase: true });

    // Generate served file list
    fileList = {};
    photos.forEach((f) => {
      fileList[f] = { raw: f, preview: relative(outDir, getPreviewFile(f)), thumbnail: relative(outDir, getThumbnailFile(f)) };
    });

    videos.forEach((v) => {
      const ext = extname(v);
      fileList[v] = {
        preview: relative(outDir, getPreviewFile(v)),
        video: relative(outDir, getPreviewFile(v)).replace('previews/', 'raw/').replace('.gif', ext).replace('.jpg', ext),
      };
    });

    rootDirs = (await readdir(inDir)).filter((f) => extname(f) === '').reverse();

    console.log(`Starting batch processing of ${photos.length} photos\n`);

    let estTime = '???';
    let avg = 0;

    for (let i = 0; i < photos.length; i++) {
      const f = photos[i];
      const ext = extname(f).toLowerCase();
      if (ext === '.cr2') {
        progress = `${(((i + 1) / photos.length) * 100).toFixed(1)}% [${i + 1}/${photos.length}] (est ${estTime})`;
        const start = Date.now();

        const exif = metadata[f] || (await getMetadata(f));

        const previewInfo = await generatePreview(f, undefined, exif);
        const thumbnailInfo = await generateThumbnail(f, previewInfo.raw, exif);

        if (!previewInfo.exists || !thumbnailInfo.exists || debug || !process.stdout.clearLine) console.log(`${progress} ${f}`);
        else process.stdout.write('.');

        if (!previewInfo.exists || debug) console.log(previewInfo.info);
        if (!thumbnailInfo.exists || debug) console.log(thumbnailInfo.info);

        const diff = (Date.now() - start) * (photos.length - i);
        if (estTime === '???') avg = diff;
        else avg = 0.95 * avg + 0.05 * diff;

        if (!previewInfo.exists || !thumbnailInfo.exists || debug) console.log(`  Processing took [${Date.now() - start}ms]`);

        estTime = new Date(avg).toISOString().substring(11, 19);
      }
    }

    if (metadataCounter > 0) await writeMetadata();

    console.log(`\n\nStarting batch processing of ${videos.length} videos\n`);
    estTime = '???';
    avg = 0;
    for (let i = 0; i < videos.length; i++) {
      progress = `${(((i + 1) / videos.length) * 100).toFixed(1)}% [${i + 1}/${videos.length}] (est ${estTime})`;
      const start = Date.now();

      const f = videos[i];
      const previewFile = getPreviewFile(videos[i]);

      await mkdir(dirname(previewFile), { recursive: true });

      // if (existsSync(previewFile)) rmSync(previewFile);

      if (!existsSync(previewFile)) {
        console.log(`${progress} ${f}`);

        const gifDuration = 5;
        const fps = 6;
        const desiredFrames = gifDuration * fps;

        // Not sure if this is the best way to do this.. Maybe need a more efficient way
        // const command = `ffmpeg -i ${f} -framerate 1 -vf "thumbnail,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse,settb=1/2,setpts=N" -frames:v ${desiredFrames} ${previewFile}`;

        const command = `ffmpeg -i ${f} -vf "thumbnail" -frames:v 1 ${previewFile}`;
        const result = execSync(command).toString();

        console.log(result);

        console.log(`  Processing took [${Date.now() - start}ms]`);
      } else process.stdout.write('.');

      const diff = (Date.now() - start) * (videos.length - i);
      if (estTime === '???') avg = diff;
      else avg = 0.95 * avg + 0.05 * diff;

      estTime = new Date(avg).toISOString().substring(11, 19);
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\n\nProcessing Complete!');
  processing = false;
  progress = undefined;
}

function getPreviewFile(f) {
  const ext = extname(f);
  const previewFile = resolve(
    f
      .replace(ext, '.jpg')
      // .replace('.cr2', '.jpg')
      // .replace('.mp4', '.jpg')
      // .replace('.mov', '.jpg')
      .replace(inDir, outDir + '/previews/')
  );

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

      console.log(exif);

      const modifiedPreview = piexif.insert(exif, raw.previewImage().toString('binary'));
      await writeFile(previewFile, modifiedPreview, { encoding: 'binary' });

      info = `  + ${previewFile}`;
    } catch (err) {
      info = `  x ${previewFile}`;
      console.error(f, err);
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
      console.error(f, err);
    }
  }

  return { exists, info };
}

async function loadMetadata() {
  try {
    const data = await readFile(metadataFile);
    metadata = JSON.parse(data.toString());
  } catch (err) {
    // Do nothing if metadata file does not exist
  }
}

async function writeMetadata() {
  console.log('\nWriting metadata');

  try {
    await writeFile(metadataFile, JSON.stringify(metadata));
  } catch (err) {
    console.error('Error writing metadata', err);
  }

  metadataCounter = 0;
}

async function getMetadata(f) {
  const meta = await exifr.parse(f, { pick: ['Orientation', 'DateTimeOriginal'], translateValues: false });
  metadata[f] = meta;
  metadataCounter++;

  if (metadataCounter >= 200) await writeMetadata();

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

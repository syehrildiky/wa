const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

async function downloadMp3(url) {
  try {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const filePath = path.resolve(__dirname, 'tmp_' + Date.now() + '.mp3');
    await new Promise((resolve, reject) => {
      ytdl(url, { filter: 'audioonly', quality: 'highestaudio' })
        .pipe(fs.createWriteStream(filePath))
        .on('finish', resolve)
        .on('error', reject);
    });
    const stats = fs.statSync(filePath);
    return { success: true, filePath, info: { title }, size: stats.size };
  } catch (e) {
    return { success: false, error: String(e.message) };
  }
}

async function downloadMp4(url) {
  try {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const filePath = path.resolve(__dirname, 'tmp_' + Date.now() + '.mp4');
    await new Promise((resolve, reject) => {
      ytdl(url, { filter: 'audioandvideo', quality: '18' }) // 18 = 360p mp4
        .pipe(fs.createWriteStream(filePath))
        .on('finish', resolve)
        .on('error', reject);
    });
    const stats = fs.statSync(filePath);
    return { success: true, filePath, info: { title }, size: stats.size };
  } catch (e) {
    return { success: false, error: String(e.message) };
  }
}

module.exports = { downloadMp3, downloadMp4 };

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');
const { downloadMp3, downloadMp4 } = require('./fd');
const { uploadToDrive } = require('./gd');
const https = require('https');

const BOT_START_TIME = Date.now();

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const jam = Math.floor(s / 3600);
  const menit = Math.floor((s % 3600) / 60);
  const detik = s % 60;
  return `${jam}j ${menit}m ${detik}s`;
}

function safeFilename(name) {
  return name.replace(/[^a-z0-9_\- \[\]\(\)\.]/gi, '_');
}

const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(text, answer => { rl.close(); resolve(answer); }));
};

function logChat(from, sender, text) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const waktu = now.toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[CHAT] [${waktu}] [${from}] [${sender}] : ${text}`);
}
function logBot(from, text) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const waktu = now.toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[BOT ] [${waktu}] [${from}] : ${text}`);
}
function logError(context, error) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const waktu = now.toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[ERR!] [${waktu}] [${context}] : ${error}`);
}

async function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error(`[ERR!] Gagal hapus file: ${filePath}`, e);
  }
}

// Spinner/animasi loading di terminal
function startSpinner(text) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  process.stdout.write(' ');
  const timer = setInterval(() => {
    process.stdout.write('\r' + frames[i = ++i % frames.length] + ' ' + text);
  }, 80);
  return () => {
    clearInterval(timer);
    process.stdout.write('\r✔️ ' + text + '\n');
  };
}

// Waktu Indonesia (pagi/siang/sore/malam) + emoji
function getWaktuIndonesia() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const jam = now.getHours();
  if (jam >= 4 && jam < 10) return "Pagi 🌅";
  if (jam >= 10 && jam < 15) return "Siang ☀️";
  if (jam >= 15 && jam < 18) return "Sore 🌇";
  if (jam >= 18 && jam < 24) return "Malam 🌙";
  return "Dini Hari 🌃";
}

// Nama hari dalam bahasa Indonesia + emoji
function getHariIndonesia(date = new Date()) {
  const hari = ["Minggu 🏖️","Senin 💼","Selasa 📚","Rabu 📚","Kamis 📚","Jumat 🕌","Sabtu 🛒"];
  return hari[date.getDay()];
}

// Tanggal Indonesia
function getTanggalIndonesia(date = new Date()) {
  const bulan = [
    "Januari","Februari","Maret","April","Mei","Juni",
    "Juli","Agustus","September","Oktober","November","Desember"
  ];
  return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

// Ambil cuaca dari Open-Meteo API (Kediri, Jatim)
function getCuacaKediri() {
  return new Promise((resolve) => {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-7.8166&longitude=112.0111&current=temperature_2m,weathercode";
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const obj = JSON.parse(data);
          const temp = obj.current.temperature_2m;
          const kode = obj.current.weathercode;
          let cuaca = "Cerah ☀️";
          if ([2,3,45,48].includes(kode)) cuaca = "Berkabut 🌫️";
          else if ([51,53,55,56,57,61,63,65].includes(kode)) cuaca = "Gerimis 🌦️";
          else if ([71,73,75,77,85,86].includes(kode)) cuaca = "Salju ❄️";
          else if ([80,81,82].includes(kode)) cuaca = "Hujan Lebat 🌧️";
          else if ([95,96,99].includes(kode)) cuaca = "Badai/Petir ⛈️";
          else if ([1].includes(kode)) cuaca = "Cerah Berawan 🌤️";
          else if ([45,48].includes(kode)) cuaca = "Berkabut 🌫️";
          else if ([0].includes(kode)) cuaca = "Cerah ☀️";
          resolve(`${cuaca} (${temp}°C)`);
        } catch {
          resolve("Tidak diketahui");
        }
      });
    }).on('error', () => resolve("Tidak diketahui"));
  });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.04.4"]
  });

  sock.ev.on('creds.update', saveCreds);

  // Animasi saat QR muncul/menunggu koneksi
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n=== QR CODE ===\n');
      console.log(qr);
      console.log('\nScan QR ini di WhatsApp HP kamu!');
    }
    if (connection === 'connecting') {
      if (!global.spinnerStop) global.spinnerStop = startSpinner('Menghubungkan ke WhatsApp...');
    }
    if (connection === 'open') {
      if (global.spinnerStop) global.spinnerStop();
      const show = startSpinner('Bot aktif dan siap menerima pesan!');
      setTimeout(show, 1500);
      console.log('Bot siap!\n');
      console.log('Ketik ".menu" di WhatsApp untuk melihat fitur.');
    }
    if (connection === 'close') {
      if (global.spinnerStop) global.spinnerStop();
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Reconnecting in 3 seconds...');
        setTimeout(startBot, 3000);
      } else {
        console.log('You are logged out. Please scan QR again.');
        process.exit();
      }
    }
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = await question('Masukan Nomor Aktif Awali Dengan 62:\n');
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(`Pairing code: ${code}\nMasukkan ke WhatsApp Web HP-mu.`);
  }

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    const sender = msg.pushName || (msg.key.participant ? msg.key.participant.split('@')[0] : 'Unknown');
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    logChat(from, sender, body);

    // --- FITUR OTOMATIS STIKER ---
    const isImage = !!msg.message.imageMessage;
    const caption = msg.message?.imageMessage?.caption?.trim().toLowerCase() || '';
    if (isImage && caption === '.s') {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
        );
        const filename = './tmp_gambar.jpg';
        const webpOut = './tmp_stiker.webp';
        fs.writeFileSync(filename, buffer);
        exec(`cwebp -q 80 -resize 512 512 ${filename} -o ${webpOut}`, async (err) => {
          if (err) {
            await sock.sendMessage(from, { text: '❌ Gagal konversi ke stiker.' }, { quoted: msg });
            logBot(from, 'Gagal konversi stiker.');
          } else {
            await sock.sendMessage(from, { sticker: fs.readFileSync(webpOut) }, { quoted: msg });
            logBot(from, 'Stiker terkirim.');
          }
          await safeUnlink(filename); await safeUnlink(webpOut);
        });
      } catch (e) {
        await sock.sendMessage(from, { text: '❌ Terjadi error saat proses stiker.' }, { quoted: msg });
        logError('stiker', e);
      }
      return;
    }

    // --- OTOMATIS LINK YOUTUBE ---
    const ytRegex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i;
    const ytLink = body.match(ytRegex)?.[0];

    if (ytLink) {
      let isMp4 = /\bmp4\b/i.test(body);
      try {
        await sock.sendMessage(from, { text: isMp4 ? 'Mengunduh video (mp4)...' : 'Mengunduh audio (mp3)...' }, { quoted: msg });
        let res;
        if (isMp4) {
          logBot(from, `Deteksi otomatis link YouTube MP4: ${ytLink}`);
          res = await downloadMp4(ytLink);
        } else {
          logBot(from, `Deteksi otomatis link YouTube MP3: ${ytLink}`);
          res = await downloadMp3(ytLink);
        }
        if (!res.success) {
          await sock.sendMessage(from, { text: `Gagal: ${res.error}` }, { quoted: msg });
          logBot(from, `Gagal auto yt: ${res.error}`);
        } else if (res.size > 20971520) { // >20MB
          await sock.sendMessage(from, { text: 'Ukuran file > 20MB, upload ke Google Drive...' }, { quoted: msg });
          const ext = isMp4 ? '.mp4' : '.mp3';
          const link = await uploadToDrive(res.filePath, safeFilename(res.info.title) + ext);
          await sock.sendMessage(from, { text: `✅ Download selesai:\n${res.info.title}\n\n[Google Drive]\n${link}` }, { quoted: msg });
          await safeUnlink(res.filePath);
          logBot(from, 'Link Google Drive dikirim');
        } else {
          if (isMp4) {
            await sock.sendMessage(from, {
              video: { url: res.filePath, fileName: safeFilename(res.info.title) + '.mp4' },
              mimetype: 'video/mp4'
            }, { quoted: msg });
          } else {
            await sock.sendMessage(from, {
              audio: { url: res.filePath, fileName: safeFilename(res.info.title) + '.mp3' },
              mimetype: 'audio/mp4'
            }, { quoted: msg });
          }
          await safeUnlink(res.filePath);
          await sock.sendMessage(from, { text: `✅ Download selesai: ${res.info.title}` }, { quoted: msg });
          logBot(from, 'Sukses kirim file');
        }
      } catch (e) {
        await sock.sendMessage(from, { text: 'Terjadi error saat download otomatis.' }, { quoted: msg });
        logError('auto.yt', e);
      }
      return;
    }

    const [command, arg] = body.trim().split(' ');

    // --- MENU TEKS KEREN (.menu/.help) ---
    if (command === '.menu' || command === '.help') {
      const uptime = formatUptime(Date.now() - BOT_START_TIME);
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const hari = getHariIndonesia(now);
      const tanggal = getTanggalIndonesia(now);
      const waktu = now.toTimeString().slice(0,5);
      const waktuIndo = getWaktuIndonesia();

      const cuaca = await getCuacaKediri();

      let menuText = `
*🤖 MENU UTAMA BOT*
${hari}, ${tanggal}
Jam: ${waktu} WIB • Selamat ${waktuIndo}
Cuaca Kediri: ${cuaca}

🎵 *YouTube MP3*
  • Download audio dari YouTube
  • Format: .ytmp3 <link>

🎬 *YouTube MP4*
  • Download video dari YouTube
  • Format: .ytmp4 <link>

🖼️ *Stiker Otomatis*
  • Kirim foto dengan caption .s, otomatis jadi stiker

📦 *Batas Ukuran Download:*
  • Jika file lebih dari 20MB, otomatis diupload ke Google Drive

© Bot WhatsApp by Hiro
      `.trim();
      await sock.sendMessage(from, { text: menuText }, { quoted: msg });
      logBot(from, 'Tampilkan menu teks+cuaca');
      return;
    }

    // --- YTMP3 MANUAL ---
    if (command === '.ytmp3' && arg) {
      try {
        await sock.sendMessage(from, { text: 'Mengunduh audio...' }, { quoted: msg });
        logBot(from, `Proses .ytmp3 ${arg}`);
        const res = await downloadMp3(arg);
        if (!res.success) {
          await sock.sendMessage(from, { text: `Gagal: ${res.error}` }, { quoted: msg });
          logBot(from, `Gagal .ytmp3: ${res.error}`);
        } else if (res.size > 20971520) { // >20MB
          await sock.sendMessage(from, { text: 'Ukuran file > 20MB, upload ke Google Drive...' }, { quoted: msg });
          const link = await uploadToDrive(res.filePath, safeFilename(res.info.title) + '.mp3');
          await sock.sendMessage(from, { text: `✅ Download selesai:\n${res.info.title}\n\n[Google Drive]\n${link}` }, { quoted: msg });
          await safeUnlink(res.filePath);
          logBot(from, 'Link Google Drive dikirim');
        } else {
          await sock.sendMessage(from, {
            audio: { url: res.filePath, fileName: safeFilename(res.info.title) + '.mp3' },
            mimetype: 'audio/mp4'
          }, { quoted: msg });
          await safeUnlink(res.filePath);
          await sock.sendMessage(from, { text: `✅ Download selesai: ${res.info.title}` }, { quoted: msg });
          logBot(from, 'Sukses kirim audio');
        }
      } catch (e) {
        await sock.sendMessage(from, { text: 'Terjadi error saat download audio.' }, { quoted: msg });
        logError('.ytmp3', e);
      }
      return;
    }

    // --- YTMP4 MANUAL ---
    if (command === '.ytmp4' && arg) {
      try {
        await sock.sendMessage(from, { text: 'Mengunduh video...' }, { quoted: msg });
        logBot(from, `Proses .ytmp4 ${arg}`);
        const res = await downloadMp4(arg);
        if (!res.success) {
          await sock.sendMessage(from, { text: `Gagal: ${res.error}` }, { quoted: msg });
          logBot(from, `Gagal .ytmp4: ${res.error}`);
        } else if (res.size > 20971520) { // >20MB
          await sock.sendMessage(from, { text: 'Ukuran file > 20MB, upload ke Google Drive...' }, { quoted: msg });
          const link = await uploadToDrive(res.filePath, safeFilename(res.info.title) + '.mp4');
          await sock.sendMessage(from, { text: `✅ Download selesai:\n${res.info.title}\n\n[Google Drive]\n${link}` }, { quoted: msg });
          await safeUnlink(res.filePath);
          logBot(from, 'Link Google Drive dikirim');
        } else {
          await sock.sendMessage(from, {
            video: { url: res.filePath, fileName: safeFilename(res.info.title) + '.mp4' },
            mimetype: 'video/mp4'
          }, { quoted: msg });
          await safeUnlink(res.filePath);
          await sock.sendMessage(from, { text: `✅ Download selesai: ${res.info.title}` }, { quoted: msg });
          logBot(from, 'Sukses kirim video');
        }
      } catch (e) {
        await sock.sendMessage(from, { text: 'Terjadi error saat download video.' }, { quoted: msg });
        logError('.ytmp4', e);
      }
      return;
    }

    if (body.startsWith('.')) {
      logBot(from, `Perintah tidak dikenal: ${body}`);
    }
  });

  process.on('uncaughtException', err => {
    logError('GLOBAL', err);
  });
  process.on('unhandledRejection', err => {
    logError('GLOBAL', err);
  });
}

startBot();

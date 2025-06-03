const { google } = require('googleapis');
const fs = require('fs');

const FOLDER_ID = '1ha2fq3hPo4ghjWYIUpAJUeuepx2DP66n';

async function uploadToDrive(filePath, fileName) {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'mail.json', // <--- gunakan nama mail.json
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  const drive = google.drive({ version: 'v3', auth });
  const fileMeta = { name: fileName, parents: [FOLDER_ID] };
  const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) };
  const file = await drive.files.create({ resource: fileMeta, media, fields: 'id' });
  await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });
  return `https://drive.google.com/file/d/${file.data.id}/view?usp=sharing`;
}

module.exports = { uploadToDrive };

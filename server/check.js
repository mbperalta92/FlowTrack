import { ZipArchive } from 'archiver';
import fs from 'fs';

const output = fs.createWriteStream('test.zip');
const archive = new ZipArchive({ zlib: { level: 9 } });

archive.pipe(output);
archive.append('String test!', { name: 'file1.txt' });
archive.finalize().then(() => {
  console.log("Zip finalized");
});

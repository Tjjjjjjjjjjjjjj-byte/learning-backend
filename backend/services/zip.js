import fs from "fs";
import zlib from "zlib";
import { once } from "events";

/*
 * Minimal streaming ZIP writer (STORE method, no dependency). mp3 files are
 * already compressed, so storing them costs nothing and keeps this tiny.
 * Sizes and CRCs are computed first, so every header is complete and the
 * exact Content-Length is known (Chrome can show real download progress).
 * Limits (no ZIP64): each file and the whole archive under 4 GB, under 65535 files.
 */

const MAX_32 = 0xffffffff;

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (Math.max(date.getFullYear(), 1980) - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function crc32OfFile(file) {
  let crc = 0;
  for await (const chunk of fs.createReadStream(file)) {
    crc = zlib.crc32(chunk, crc);
  }
  return crc >>> 0;
}

/* Makes "a.mp3" unique inside the archive: "a (2).mp3", "a (3).mp3", ... */
function uniqueName(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
}

/** entries: [{ file: absolutePath, name: "Artist - Title.mp3" }] */
export async function prepareZip(entries) {
  if (entries.length > 65534) throw new Error("Too many files for a zip");

  const used = new Set();
  const prepared = [];
  let total = 22; // end of central directory

  for (const entry of entries) {
    const size = fs.statSync(entry.file).size;
    if (size > MAX_32) throw new Error("File too large for a zip");
    const name = uniqueName(entry.name, used);
    const nameBuf = Buffer.from(name, "utf-8");
    const crc = await crc32OfFile(entry.file);
    prepared.push({ file: entry.file, nameBuf, size, crc, mtime: fs.statSync(entry.file).mtime });
    total += 30 + nameBuf.length + size + 46 + nameBuf.length;
  }

  if (total > MAX_32) throw new Error("Archive too large");
  return { prepared, contentLength: total };
}

async function write(res, chunk) {
  if (res.destroyed) throw new Error("Client disconnected");
  if (!res.write(chunk)) await once(res, "drain");
}

export async function writePreparedZip(res, { prepared }) {
  const central = [];
  let offset = 0;

  for (const item of prepared) {
    const { time, day } = dosDateTime(item.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(0, 8);             // STORE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(item.crc, 14);
    local.writeUInt32LE(item.size, 18);
    local.writeUInt32LE(item.size, 22);
    local.writeUInt16LE(item.nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    await write(res, local);
    await write(res, item.nameBuf);

    let sent = 0;
    for await (const chunk of fs.createReadStream(item.file)) {
      sent += chunk.length;
      await write(res, chunk);
    }
    if (sent !== item.size) throw new Error("A file changed while it was being zipped");

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);               // version made by
    cd.writeUInt16LE(20, 6);               // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(day, 14);
    cd.writeUInt32LE(item.crc, 16);
    cd.writeUInt32LE(item.size, 20);
    cd.writeUInt32LE(item.size, 24);
    cd.writeUInt16LE(item.nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, item.nameBuf);

    offset += 30 + item.nameBuf.length + item.size;
  }

  const cdBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(prepared.length, 8);
  end.writeUInt16LE(prepared.length, 10);
  end.writeUInt32LE(cdBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  await write(res, cdBuffer);
  await write(res, end);
  res.end();
}

const crypto = require("node:crypto");

const MATRIX = [
"00110100101100","11110011101011","11011101001001","01101000011101",
"01100011000110","10011000100011","10011100010000","11100000001000",
"00011101111101","11111100110001","11010000011011","11110010101100",
"01011101000110","01101101101011"
].map(row => row.replace(/\s/g, ""));

function spiralCounterClockwise(matrix) {
  const a = matrix.map(row => [...row]);
  const out = [];
  let top = 0, bottom = a.length - 1, left = 0, right = a[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let r = top; r <= bottom; r++) out.push(a[r][left]);
    left++;
    for (let c = left; c <= right; c++) out.push(a[bottom][c]);
    bottom--;
    if (left <= right) for (let r = bottom; r >= top; r--) out.push(a[r][right]);
    right--;
    if (top <= bottom) for (let c = right; c >= left; c--) out.push(a[top][c]);
    top++;
  }
  return out;
}

function decodeMatrix(matrix = MATRIX) {
  const bits = spiralCounterClockwise(matrix).join("");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return { bitLength: bits.length, byteLength: bytes.length, bits, text: Buffer.from(bytes).toString("ascii") };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

// OpenSSL enc legacy password derivation: EVP_BytesToKey with MD5 (OpenSSL default).
function evpBytesToKey(password, salt, keyLength = 32, ivLength = 16) {
  let material = Buffer.alloc(0), previous = Buffer.alloc(0);
  while (material.length < keyLength + ivLength) {
    previous = crypto.createHash("md5").update(Buffer.concat([previous, Buffer.from(password, "utf8"), salt])).digest();
    material = Buffer.concat([material, previous]);
  }
  return { key: material.subarray(0, keyLength), iv: material.subarray(keyLength, keyLength + ivLength) };
}

function decryptOpenSslAes256Cbc(base64Ciphertext, password, digest = "md5") {
  const raw = Buffer.from(base64Ciphertext.replace(/\s+/g, ""), "base64");
  if (raw.length < 16 || raw.subarray(0, 8).toString("ascii") !== "Salted__") {
    throw new Error("Expected OpenSSL salted Base64 input beginning with Salted__.");
  }
  const salt = raw.subarray(8, 16);
  let key, iv;
  if (digest === "md5") ({ key, iv } = evpBytesToKey(password, salt));
  else if (digest === "sha256") {
    let material = Buffer.alloc(0), prev = Buffer.alloc(0);
    while (material.length < 48) {
      prev = crypto.createHash("sha256").update(Buffer.concat([prev, Buffer.from(password), salt])).digest();
      material = Buffer.concat([material, prev]);
    }
    key = material.subarray(0, 32); iv = material.subarray(32, 48);
  } else throw new Error("Supported OpenSSL digest modes: md5, sha256.");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString("utf8");
}

function beaufort(text, key) {
  const clean = text.toLowerCase().replace(/[^a-z]/g, "");
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) throw new Error("Beaufort key is empty.");
  return [...clean].map((ch, i) => String.fromCharCode(97 + (k.charCodeAt(i % k.length) - ch.charCodeAt(0) + 26) % 26)).join("");
}

function ebcdic1141BytesToText(bytes) {
  // IBM-1141 is an EBCDIC code page; use a strict table, not ASCII reinterpretation.
  const cp1141 = require("./tables/ebcdic-1141.json");
  return [...bytes].map(b => cp1141[b] ?? "\\u{" + b.toString(16) + "}").join("");
}

module.exports = { MATRIX, spiralCounterClockwise, decodeMatrix, sha256, decryptOpenSslAes256Cbc, beaufort, ebcdic1141BytesToText };

"use strict";
const crypto = require("node:crypto");

function sha256(text) { return crypto.createHash("sha256").update(text, "utf8").digest("hex"); }
function sha256Bytes(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function base64Decode(text) {
  const clean = text.replace(/\s+/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) throw new Error("Input is not canonical Base64.");
  return Buffer.from(clean, "base64");
}
function hexDecode(text) {
  const clean = text.replace(/\s+/g, "");
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(clean)) throw new Error("Hex input must contain complete byte pairs.");
  return Buffer.from(clean, "hex");
}
function printableRatio(buffer) {
  if (!buffer.length) return 0;
  let n = 0;
  for (const b of buffer) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) n++;
  return n / buffer.length;
}
function analyzeText(input) {
  const candidates = [];
  const add = (name, fn) => {
    try {
      const bytes = fn();
      candidates.push({ transform: name, bytes: bytes.length, printableRatio: Number(printableRatio(bytes).toFixed(3)), preview: bytes.toString("utf8").slice(0, 240), sha256: sha256Bytes(bytes) });
    } catch (e) { candidates.push({ transform: name, error: e.message }); }
  };
  add("Base64 decode", () => base64Decode(input));
  add("Hex decode", () => hexDecode(input));
  return {
    inputBytes: Buffer.byteLength(input, "utf8"),
    sha256: sha256(input),
    characterStats: { length: input.length, letters: (input.match(/[A-Za-z]/g) || []).length, digits: (input.match(/[0-9]/g) || []).length, whitespace: (input.match(/\s/g) || []).length, uniqueCharacters: new Set(input).size },
    candidates
  };
}
function xorRepeat(inputHex, keyHex) {
  const data = hexDecode(inputHex), key = hexDecode(keyHex);
  if (!key.length) throw new Error("XOR key cannot be empty.");
  return Buffer.from(data.map((b, i) => b ^ key[i % key.length])).toString("hex");
}
module.exports = { analyzeText, sha256, base64Decode, hexDecode, xorRepeat, printableRatio };

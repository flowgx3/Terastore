const assert = require("node:assert/strict");
const { decodeMatrix, sha256, beaufort } = require("./core");

const matrix = decodeMatrix();
assert.equal(matrix.text, "gsmg.io/theseedisplanted", "14x14 counterclockwise spiral must reproduce the published URL");
assert.equal(matrix.bitLength, 196, "14x14 matrix must contain 196 bits");
assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 known-answer test");
assert.equal(beaufort("THEMATRIXHASYOU", "THEMATRIXHASYOU"), "aaaaaaaaaaaaaaa", "Beaufort known-answer test");
console.log("GSMG verification passed: matrix, SHA-256, Beaufort.");

"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const original = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trace-x-"));
try {
  process.chdir(temp);
  const engine = require(path.join(original, "src/research/engine.js"));
  const report = engine.analyzeText("SGVsbG8=");
  assert.equal(report.candidates[0].preview, "Hello");
  assert.equal(report.candidates[0].printableRatio, 1);
  assert.equal(report.characterStats.whitespace, 0);
  assert.equal(engine.hexDecode("48656c6c6f").toString("utf8"), "Hello");
  assert.throws(() => engine.hexDecode("abc"));
  assert.equal(engine.xorRepeat("4142", "01"), "4043");

  const assets = require(path.join(original, "src/research/assets.js"));
  const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0); png.writeUInt32BE(320,16); png.writeUInt32BE(200,20);
  const assetReport = assets.inspectAsset(png);
  assert.equal(assetReport.kind, "image");
  assert.equal(assetReport.metadata.width, 320);
  assert.equal(assetReport.metadata.height, 200);

  const store = require(path.join(original, "src/research/store.js"));
  const c = store.createCase("Test case", "CI verification");
  const c2 = store.addEvidence(c.id, "known plaintext", "Hello", "test");
  assert.equal(c2.evidence[0].sha256, engine.sha256("Hello"));
  const c3 = store.addHypothesis(c.id, "Base64 contains the plaintext", "Known test vector");
  const h = c3.hypotheses[0];
  assert.equal(h.status, "untested");
  const c4 = store.testHypothesis(c.id, h.id, "supported", "Decoded to Hello");
  assert.equal(c4.hypotheses[0].status, "hypothesis");
  assert.equal(store.getCase(c.id).evidence.length, 1);
  console.log("TRACE X research verification passed");
} finally {
  process.chdir(original);
  fs.rmSync(temp, { recursive: true, force: true });
}

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = path.join(process.cwd(), "data", "research");
const DB_FILE = path.join(DATA_DIR, "cases.json");

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ version: 1, cases: [] }, null, 2));
}
function readStore() {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (parsed.version !== 1 || !Array.isArray(parsed.cases)) throw new Error("Research store schema is invalid.");
  return parsed;
}
function writeStore(data) {
  ensureStore();
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DB_FILE);
}
function id(prefix) { return prefix + "_" + crypto.randomBytes(5).toString("hex"); }
function now() { return new Date().toISOString(); }
function createCase(title, description = "") {
  if (!title || title.trim().length < 3) throw new Error("Case title must contain at least 3 characters.");
  const db = readStore();
  const item = { id: id("case"), title: title.trim().slice(0, 120), description: description.slice(0, 1000), status: "active", createdAt: now(), updatedAt: now(), evidence: [], hypotheses: [], experiments: [] };
  db.cases.push(item); writeStore(db); return item;
}
function getCase(caseId) {
  const item = readStore().cases.find(x => x.id === caseId);
  if (!item) throw new Error("Case not found. Check the case ID.");
  return item;
}
function updateCase(caseId, fn) {
  const db = readStore(); const item = db.cases.find(x => x.id === caseId);
  if (!item) throw new Error("Case not found. Check the case ID.");
  fn(item); item.updatedAt = now(); writeStore(db); return item;
}
function listCases() { return readStore().cases.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
function addEvidence(caseId, label, content, source = "manual") {
  if (!label || !content) throw new Error("Evidence label and content are required.");
  const digest = crypto.createHash("sha256").update(content, "utf8").digest("hex");
  return updateCase(caseId, c => c.evidence.push({ id: id("ev"), label: label.slice(0,120), source: source.slice(0,300), content: content.slice(0,12000), sha256: digest, createdAt: now(), status: "raw" }));
}
function addHypothesis(caseId, statement, rationale = "") {
  if (!statement || statement.trim().length < 5) throw new Error("Hypothesis must contain at least 5 characters.");
  return updateCase(caseId, c => c.hypotheses.push({ id: id("hyp"), statement: statement.trim().slice(0,1000), rationale: rationale.slice(0,1000), status: "untested", tests: [], createdAt: now() }));
}
function testHypothesis(caseId, hypothesisId, outcome, notes = "") {
  const allowed = ["supported", "rejected", "inconclusive"];
  if (!allowed.includes(outcome)) throw new Error("Outcome must be supported, rejected, or inconclusive.");
  return updateCase(caseId, c => {
    const h = c.hypotheses.find(x => x.id === hypothesisId);
    if (!h) throw new Error("Hypothesis not found.");
    h.tests.push({ outcome, notes: notes.slice(0,1500), at: now() });
    h.status = outcome === "supported" ? "hypothesis" : outcome === "rejected" ? "rejected" : "untested";
  });
}
function addExperiment(caseId, experiment) {
  return updateCase(caseId, c => c.experiments.push({ id: id("exp"), ...experiment, createdAt: now() }));
}
module.exports = { createCase, getCase, listCases, addEvidence, addHypothesis, testHypothesis, addExperiment };

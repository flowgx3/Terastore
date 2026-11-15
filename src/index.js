require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require("discord.js");
const { MATRIX, decodeMatrix, sha256, decryptOpenSslAes256Cbc, beaufort } = require("./gsmg/core");
const research = require("./research/store");
const engine = require("./research/engine");
const assets = require("./research/assets");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");

const gsmg = new SlashCommandBuilder().setName("gsmg").setDescription("GSMG 5 BTC puzzle tools")
 .addSubcommand(s => s.setName("status").setDescription("Show implemented solver modules"))
 .addSubcommand(s => s.setName("matrix").setDescription("Re-run the published 14x14 matrix extraction"))
 .addSubcommand(s => s.setName("sha256").setDescription("SHA-256 exact UTF-8 text").addStringOption(o => o.setName("text").setDescription("Exact input").setRequired(true).setMaxLength(1800)))
 .addSubcommand(s => s.setName("decrypt").setDescription("Decrypt OpenSSL AES-256-CBC salted Base64")
  .addStringOption(o => o.setName("password").setDescription("Exact password").setRequired(true).setMaxLength(256))
  .addStringOption(o => o.setName("blob").setDescription("Base64 blob").setMaxLength(1800))
  .addAttachmentOption(o => o.setName("file").setDescription("Text file containing the blob")))
 .addSubcommand(s => s.setName("beaufort").setDescription("Run Beaufort cipher")
  .addStringOption(o => o.setName("text").setDescription("Ciphertext").setRequired(true).setMaxLength(1800))
  .addStringOption(o => o.setName("key").setDescription("Exact key").setRequired(true).setMaxLength(128)));

const lab = new SlashCommandBuilder().setName("lab").setDescription("TRACE X research workspace")
 .addSubcommand(s => s.setName("case-create").setDescription("Create a research case")
  .addStringOption(o => o.setName("title").setDescription("Case title").setRequired(true).setMaxLength(120))
  .addStringOption(o => o.setName("description").setDescription("Context").setMaxLength(1000)))
 .addSubcommand(s => s.setName("case-list").setDescription("List research cases"))
 .addSubcommand(s => s.setName("case-show").setDescription("Show a case summary")
  .addStringOption(o => o.setName("case-id").setDescription("Case ID").setRequired(true)))
 .addSubcommand(s => s.setName("evidence-add").setDescription("Record evidence with integrity hash")
  .addStringOption(o => o.setName("case-id").setDescription("Case ID").setRequired(true))
  .addStringOption(o => o.setName("label").setDescription("Evidence label").setRequired(true).setMaxLength(120))
  .addStringOption(o => o.setName("content").setDescription("Exact evidence text").setRequired(true).setMaxLength(1800))
  .addStringOption(o => o.setName("source").setDescription("URL or filename").setMaxLength(300)))
 .addSubcommand(s => s.setName("hypothesis-add").setDescription("Record a testable hypothesis")
  .addStringOption(o => o.setName("case-id").setDescription("Case ID").setRequired(true))
  .addStringOption(o => o.setName("statement").setDescription("Hypothesis").setRequired(true).setMaxLength(1000))
  .addStringOption(o => o.setName("rationale").setDescription("Reasoning").setMaxLength(1000)))
 .addSubcommand(s => s.setName("hypothesis-test").setDescription("Record a hypothesis test result")
  .addStringOption(o => o.setName("case-id").setDescription("Case ID").setRequired(true))
  .addStringOption(o => o.setName("hypothesis-id").setDescription("Hypothesis ID").setRequired(true))
  .addStringOption(o => o.setName("outcome").setDescription("Test outcome").setRequired(true)
   .addChoices({name:"Supported",value:"supported"},{name:"Rejected",value:"rejected"},{name:"Inconclusive",value:"inconclusive"}))
  .addStringOption(o => o.setName("notes").setDescription("Test method and observed result").setMaxLength(1500)))
 .addSubcommand(s => s.setName("analyze-text").setDescription("Fingerprint text and test common encodings")
  .addStringOption(o => o.setName("text").setDescription("Exact input").setRequired(true).setMaxLength(1800)))
 .addSubcommand(s => s.setName("evidence-list").setDescription("List evidence in a case")
  .addStringOption(o => o.setName("case-id").setDescription("Case ID").setRequired(true)))
 .addSubcommand(s => s.setName("asset-inspect").setDescription("Inspect image/audio/binary file headers")
  .addAttachmentOption(o => o.setName("file").setDescription("Image, audio, or binary file").setRequired(true))
  .addStringOption(o => o.setName("case-id").setDescription("Optional case ID"))
  .addStringOption(o => o.setName("label").setDescription("Evidence label").setMaxLength(120)));

async function registerCommands() {
 const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
 const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
 await rest.put(route, { body: [gsmg.toJSON(), lab.toJSON()] });
}
function codeBlock(value) { return "```\n" + String(value).slice(0, 3400).replace(/```/g, "` ` `") + "\n```"; }
function embed(title, description) {
 return { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(String(description).slice(0, 4000))] };
}
async function main() {
 await registerCommands();
 const client = new Client({ intents: [GatewayIntentBits.Guilds] });
 client.once("ready", () => console.log("TRACE X online as " + client.user.tag));
 client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || !["gsmg", "lab"].includes(interaction.commandName)) return;
  await interaction.deferReply({ ephemeral: true });
  try {
   const sub = interaction.options.getSubcommand();
   if (interaction.commandName === "gsmg") {
    let description = "";
    if (sub === "status") description = "**Available now**\n• 14×14 spiral matrix extraction\n• SHA-256 fingerprints\n• OpenSSL AES-256-CBC salted Base64 decryption (MD5 derivation)\n• Beaufort cipher\n• TRACE X case and evidence ledger\n• Text encoding triage (Base64/Hex)\n\n**Research integrity**\nHypotheses remain unverified until a reproducible test is recorded.";
    if (sub === "matrix") {
     const r = decodeMatrix(MATRIX);
     description = "Extracted: **" + r.text + "**\nBits: " + r.bitLength + " · Bytes: " + r.byteLength + "\nPublished clue match: **" + (r.text === "gsmg.io/theseedisplanted" ? "YES" : "NO") + "**";
    }
    if (sub === "sha256") {
     const input = interaction.options.getString("text", true);
     description = "Input bytes: " + Buffer.byteLength(input, "utf8") + "\nSHA-256:\n" + codeBlock(sha256(input));
    }
    if (sub === "decrypt") {
     let blob = interaction.options.getString("blob");
     const file = interaction.options.getAttachment("file");
     if (!blob && file) {
      if (file.size > 100000) throw new Error("Text attachment exceeds 100 KB limit.");
      const response = await fetch(file.url);
      if (!response.ok) throw new Error("Could not fetch attachment.");
      blob = await response.text();
     }
     if (!blob) throw new Error("Provide a blob or attach a text file.");
     const plain = decryptOpenSslAes256Cbc(blob, interaction.options.getString("password", true));
     description = "Decrypted plaintext:\n" + codeBlock(plain);
    }
    if (sub === "beaufort") {
     description = "Beaufort output:\n" + codeBlock(beaufort(interaction.options.getString("text", true), interaction.options.getString("key", true)));
    }
    await interaction.editReply(embed("GSMG · SOLVER", description));
    return;
   }

   let description = "";
   if (sub === "case-create") {
    const c = research.createCase(interaction.options.getString("title", true), interaction.options.getString("description") || "");
    description = "**Case created**\nID: " + c.id + "\nTitle: " + c.title;
   } else if (sub === "case-list") {
    const cases = research.listCases();
    description = cases.length ? cases.slice(0, 15).map(c => "**" + c.title + "**\n" + c.id + " · " + c.status + " · " + c.evidence.length + " evidence · " + c.hypotheses.length + " hypotheses").join("\n\n") : "No cases yet. Run /lab case-create.";
   } else if (sub === "case-show") {
    const c = research.getCase(interaction.options.getString("case-id", true));
    description = "**" + c.title + "**\n" + c.description + "\n\nID: " + c.id + "\nStatus: " + c.status + "\nEvidence: " + c.evidence.length + "\nHypotheses: " + c.hypotheses.length + "\nExperiments: " + c.experiments.length;
   } else if (sub === "evidence-add") {
    const c = research.addEvidence(interaction.options.getString("case-id", true), interaction.options.getString("label", true), interaction.options.getString("content", true), interaction.options.getString("source") || "manual");
    const e = c.evidence[c.evidence.length - 1];
    description = "**Evidence recorded**\nID: " + e.id + "\nSHA-256: " + e.sha256;
   } else if (sub === "evidence-list") {
    const c = research.getCase(interaction.options.getString("case-id", true));
    description = c.evidence.length ? c.evidence.slice(0, 12).map(e => "**" + e.label + "**\n" + e.id + "\nSHA-256: " + e.sha256 + "\nSource: " + e.source).join("\n\n") : "No evidence recorded.";
   } else if (sub === "hypothesis-add") {
    const c = research.addHypothesis(interaction.options.getString("case-id", true), interaction.options.getString("statement", true), interaction.options.getString("rationale") || "");
    const h = c.hypotheses[c.hypotheses.length - 1];
    description = "**Hypothesis recorded**\nID: " + h.id + "\nStatus: untested";
   } else if (sub === "hypothesis-test") {
    const c = research.testHypothesis(interaction.options.getString("case-id", true), interaction.options.getString("hypothesis-id", true), interaction.options.getString("outcome", true), interaction.options.getString("notes") || "");
    const h = c.hypotheses.find(x => x.id === interaction.options.getString("hypothesis-id", true));
    description = "**Test recorded**\nHypothesis: " + h.id + "\nCurrent status: " + h.status;
   } else if (sub === "asset-inspect") {
    const file = interaction.options.getAttachment("file", true);
    if (file.size > 10 * 1024 * 1024) throw new Error("Maximum asset size is 10 MB.");
    const response = await fetch(file.url);
    if (!response.ok) throw new Error("Could not download the attachment.");
    const buffer = Buffer.from(await response.arrayBuffer());
    const report = assets.inspectAsset(buffer);
    const caseId = interaction.options.getString("case-id");
    if (caseId) {
     const label = interaction.options.getString("label") || file.name || "uploaded asset";
     research.addEvidence(caseId, label, JSON.stringify({file:file.name,mime:file.contentType, ...report}), file.url);
    }
    description = "**Asset fingerprint**\\nFile: " + file.name + "\\nKind: " + report.kind + "\\nBytes: " + report.bytes + "\\nSHA-256: " + report.sha256 + "\\nMetadata: " + JSON.stringify(report.metadata) + "\\nHeader: " + report.headerHex + (caseId ? "\\nSaved to case: " + caseId : "");
   } else if (sub === "analyze-text") {
    const r = engine.analyzeText(interaction.options.getString("text", true));
    description = "**Input fingerprint**\nBytes: " + r.inputBytes + " · Unique chars: " + r.characterStats.uniqueCharacters + "\nSHA-256: " + r.sha256 + "\n\n**Candidate transforms**\n" + r.candidates.map(x => x.error ? x.transform + ": " + x.error : x.transform + " · printable " + x.printableRatio + "\n" + x.preview).join("\n\n");
   }
   await interaction.editReply(embed("TRACE X · RESEARCH LAB", description));
  } catch (error) {
   console.error("Command error:", error);
   await interaction.editReply({ content: "Analysis error: " + String(error.message || error).slice(0, 1500) });
  }
 });
 client.on("error", error => console.error("Discord error:", error));
 await client.login(DISCORD_TOKEN);
}
main().catch(error => { console.error(error); process.exit(1); });

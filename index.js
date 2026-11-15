const { spawnSync } = require("node:child_process");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Install dependencies, register guild slash commands, then start the bot.
run("npm", ["install"]);
run("node", ["src/deploy-commands.js"]);
run("node", ["src/index.js"]);

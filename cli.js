#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const electronPath = require("electron");
const appPath = path.join(__dirname, "main.js");

const child = spawn(electronPath, [appPath, ...args], {
  stdio: "inherit",
  detached: false,
});

child.on("exit", (code) => {
  process.exit(code);
});

#!/usr/bin/env node
import { runCommand } from "./commands.ts";

const result = await runCommand(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;

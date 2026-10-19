// Local transport for Blender 5.1's installed MCP add-on (null-delimited JSON).
// Never accepts or sends analyzed repository content.
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";

const code = `CQ_ROOT = ${JSON.stringify(process.cwd().replaceAll("\\", "/"))}\n${readFileSync(process.argv[2], "utf8")}`;
const socket = createConnection({ host: "127.0.0.1", port: 9876 });
socket.setTimeout(180000);
let data = "";
socket.on("connect", () => socket.write(`${JSON.stringify({ type: "execute", code, strict_json: true })}\0`));
socket.on("data", (chunk) => {
  data += chunk.toString();
  if (data.includes("\0")) {
    const response = JSON.parse(data.split("\0")[0]);
    console.log(JSON.stringify(response));
    socket.end();
    if (response.status !== "ok") process.exitCode = 1;
  }
});
socket.on("timeout", () => socket.destroy(new Error("Blender MCP timed out")));
socket.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

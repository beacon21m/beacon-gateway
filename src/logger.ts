import fs from "node:fs";
import { format } from "node:util";
import { createStream, type RotatingFileStream } from "rotating-file-stream";

let initialized = false;
let outStream: RotatingFileStream | null = null;
let errStream: RotatingFileStream | null = null;

const originals = {
  log: console.log.bind(console),
  info: (console.info ?? console.log).bind(console),
  debug: (console.debug ?? console.log).bind(console),
  warn: (console.warn ?? console.log).bind(console),
  error: console.error.bind(console),
};

function writeLine(stream: RotatingFileStream, args: unknown[]) {
  try {
    const line = `${new Date().toISOString()} ${format(...args)}\n`;
    stream.write(line);
  } catch (err) {
    originals.error("[logger] failed to write log line", err);
  }
}

function attachStream(
  stream: RotatingFileStream,
  methods: Array<keyof typeof originals>,
) {
  for (const method of methods) {
    const original = originals[method];
    console[method] = (...args: unknown[]) => {
      writeLine(stream, args);
      original(...args);
    };
  }
}

export function initLogging() {
  if (initialized) {
    return;
  }
  initialized = true;

  fs.mkdirSync("logs", { recursive: true });

  outStream = createStream("out.log", {
    path: "logs",
    interval: "1d",
    maxFiles: 7,
  });

  errStream = createStream("error.log", {
    path: "logs",
    interval: "1d",
    maxFiles: 7,
  });

  attachStream(outStream, ["log", "info", "debug"]);
  attachStream(errStream, ["warn", "error"]);

  const notice = originals.info;

  outStream.on("rotated", (filename: string) => {
    notice(`[logger] rotated out.log -> ${filename}`);
  });

  errStream.on("rotated", (filename: string) => {
    notice(`[logger] rotated error.log -> ${filename}`);
  });
}

export function shutdownLogging() {
  outStream?.end();
  errStream?.end();
}

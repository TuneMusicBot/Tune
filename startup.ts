import dotenv from "dotenv";
import { readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "util";
import chalk from "chalk";
import { Console, File } from "winston/lib/winston/transports";
import winston from "winston";
import { Tune } from "./src/Tune";
import { CommandError } from "./src/structures/command/CommandError";
import "moment";
import "moment-duration-format";
import { Sentry } from "./src/structures/logger/Sentry";

const logger = winston.createLogger({
  handleExceptions: true,
  handleRejections: true,
  exitOnError: false,
});

console.log(
  readFileSync(join(__dirname, "..", "banner.txt"), { encoding: "utf-8" })
);

logger.add(
  new Console({
    level: "silly",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf((info) => {
        const levelPrefix =
          info.level.includes("info") || info.level.includes("warn")
            ? `${info.level} `
            : info.level;
        const tagsPrefix =
          info.tags && info.tags.length > 0
            ? ` --- [${info.tags
                .map((t: string) => chalk.cyan(t))
                .join(", ")}]:`
            : " --- ";
        const message =
          (info.message as any) instanceof Error ||
          typeof info.message === "object"
            ? inspect(info.message, { depth: 0 })
            : String(info.message);
        return `${info.timestamp} ${levelPrefix} ${process.pid}${tagsPrefix} ${message}`;
      })
    ),
  })
);

if (existsSync(join(__dirname, "..", "logs", "latest.log"))) {
  logger.debug("Old log file found, renaming...", {
    tags: ["Logger"],
  });
  renameSync(
    join(__dirname, "..", "logs", "latest.log"),
    join(
      __dirname,
      "..",
      "logs",
      `${new Date().toISOString().replaceAll(":", "-")}.log`
    )
  );
}

logger.add(
  new File({
    level: "silly",
    dirname: join(__dirname, "..", "logs"),
    filename: "latest.log",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.uncolorize(),
      winston.format.printf((info) => {
        const levelPrefix =
          info.level.includes("info") || info.level.includes("warn")
            ? `${info.level} `
            : info.level;
        const tagsPrefix =
          info.tags && info.tags.length > 0
            ? ` --- [${info.tags.join(", ")}]:`
            : " --- ";
        const message =
          (info.message as any) instanceof Error ||
          typeof info.message === "object"
            ? inspect(info.message, { depth: 0 })
            : String(info.message);
        return `${info.timestamp} ${levelPrefix} ${process.pid}${tagsPrefix} ${message}`;
      })
    ),
  })
);

Object.defineProperty(global, "CUSTOM_COLORS", { value: Object.create(null) });

const result = dotenv.config();

if (result.error) {
  logger.error(result.error as any, { tags: ["DotEnv"] });
  process.exit(1);
}

if (process.env.SENTRY_DSN && process.env.SENTRY_DSN.length > 0) {
  logger.add(new Sentry(process.env.SENTRY_DSN));
} else {
  logger.warn("Sentry DSN not defined. Skipping Sentry configuration.", {
    tags: ["Logger", "Sentry"],
  });
}

logger.info("Logger ready.", { tags: ["Logger"] });

const tune = new Tune(logger);

process.on("uncaughtException", (error: any) => {
  if (error instanceof CommandError) {
    error.context.command.handleError(error);
    return;
  }
  tune.logger.error(error as any, { tags: ["Process"] });
});
process.on("unhandledRejection", (error: any, promise) => {
  if (error instanceof CommandError) {
    error.context.command.handleError(error);
    return;
  }
  if (typeof error === "object") Object.assign(error, { promise });
  tune.logger.error(error, { tags: ["Process"] });
});
process.on("warning", (warning: any) =>
  tune.logger.warn(warning, { tags: ["Process"] })
);

Promise.all([tune.login(process.env.DISCORD_TOKEN)]);

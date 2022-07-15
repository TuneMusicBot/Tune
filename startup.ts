import dotenv from "dotenv";

import { CommandError } from "./src/structures/command/CommandError";
import { Tune } from "./src/Tune";
import "moment";
import "moment-duration-format";

Object.defineProperty(global, "CUSTOM_COLORS", { value: Object.create(null) });
dotenv.config();

Object.defineProperty(global, "MULTIBOT_API", {
  value: "wss://multibot-wearifulcupid0.cloud.okteto.net/",
});

const tune = new Tune();

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

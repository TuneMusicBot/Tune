import Transport from "winston-transport";
import { init, captureException, captureMessage } from "@sentry/node";
import { LogCallback, LogEntry } from "winston";

export class Sentry extends Transport {
  constructor(dsn: string) {
    super({ level: "warn" });

    init({ dsn });
  }

  log(info: LogEntry, callback: LogCallback) {
    setImmediate(() => {
      if ((info.message as any) instanceof Error)
        captureException(info.message);
      else captureMessage(String(info.message));
      super.emit("logged", info);
    });

    callback();
  }
}

import { Prisma } from "@prisma/client";
import { GatewayDispatchEvents } from "discord-api-types/v10";
import {
  ClientEvents,
  FileContent,
  InteractionResponse,
  MessageContent,
} from "eris";
import { RedisMiddleware } from "../redis/RedisMiddleware";
import { Tune } from "../Tune";

export interface TypingData {
  channelID: string;
  calls: number;
  interval: NodeJS.Timer;
}

export interface RecentSearch {
  id: string;
  name: string;
  uri: string;
}
export interface RawClass<T> {
  new (client: Tune): T;
}

export type Events =
  | keyof ClientEvents
  | GatewayDispatchEvents
  | "commandExecute"
  | "autocomplete"
  | "buttonClick"
  | "selectMenuClick"
  | "modalSubmit"
  | "trackStart"
  | "trackEnd"
  | "trackStuck"
  | "trackException";

export type IModel = Record<
  Prisma.PrismaAction,
  (
    params: Prisma.MiddlewareParams,
    middleware: RedisMiddleware,
    next: (p: Prisma.MiddlewareParams) => Promise<any>
  ) => Promise<any>
>;

export type ReplyOptions = (MessageContent | InteractionResponse) & {
  files?: FileContent[];
};
export type EditReplyOptions = ReplyOptions & { messageID?: string };

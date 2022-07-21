import { RedisJSON } from "@redis/json/dist/commands";
import { IModel } from "../../@types";

const Model: IModel = {
  aggregate: (params, middleware, next) => {
    return next(params);
  },
  findFirst: (params, middleware, next) => {
    return next(params);
  },
  findMany: (params, middleware, next) => {
    return next(params);
  },
  findRaw: (params, middleware, next) => {
    return next(params);
  },
  findUnique: (params, middleware, next) => {
    return next(params);
  },
  count: (params, middleware, next) => {
    return next(params);
  },
  createMany: (params, middleware, next) => {
    return next(params);
  },
  runCommandRaw: (params, middleware, next) => {
    return next(params);
  },
  executeRaw: (params, middleware, next) => {
    return next(params);
  },
  queryRaw: (params, middleware, next) => {
    return next(params);
  },
  deleteMany: (params, middleware, next) => {
    return next(params);
  },
  update: (params, middleware, next) => {
    return next(params);
  },
  updateMany: (params, middleware, next) => {
    return next(params);
  },
  upsert: (params, middleware, next) => {
    return next(params);
  },
  create: async (params, middleware, next) => {
    const player = (await next(params)) as unknown;
    await middleware.connection.json.set(
      "players:tracks",
      (player as { id: number }).id.toString(),
      player as RedisJSON
    );
    return player;
  },
  delete: async (params, middleware, next) => {
    await middleware.connection.json.del(
      "players:tracks",
      params.args.where.id
    );
    return next(params);
  },
};

export = Model;

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
  findUnique: async (params, middleware, next) => {
    const guild = await middleware.connection.json.get(
      `discord:guilds:${params.args.where.id}`
    );
    if (guild) return guild;
    const result = (await next(params)) as unknown;
    if (result)
      await middleware.connection.json.set(
        `discord:guilds:${(result as { id: string }).id}`,
        "$",
        result as RedisJSON
      );
    return result;
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
    const guild = (await next(params)) as unknown;
    await middleware.connection.json.set(
      `discord:guilds:${params.args.data.id}`,
      "$",
      guild as RedisJSON
    );
    return guild;
  },
  delete: async (params, middleware, next) => {
    await middleware.connection.json.del(
      `discord:guilds:${params.args.where.id}`,
      "$"
    );
    return next(params);
  },
};

export = Model;

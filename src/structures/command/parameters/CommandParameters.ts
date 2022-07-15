/* eslint-disable consistent-return */
/* eslint-disable no-plusplus */
import {
  ApplicationCommandOptionType,
  CacheType,
  CommandInteractionOption,
} from "discord.js";
import { CommandParameter, Option } from "../../../@types/commands";
import { CommandContext } from "../context/CommandContext";
import { MessageCommandContext } from "../context/MessageCommandContext";
import { SlashCommandContext } from "../context/SlashCommandContext";
import Configs from "./configs";

export class CommandParameters {
  static async handleMessage(
    context: MessageCommandContext,
    args: string[]
  ): Promise<object> {
    if (context.command.flags.length > 0) {
      const firstFlagIndex = args.findIndex((a) => a.startsWith("--"));
      if (firstFlagIndex > -1) {
        const [, ...allFlags] = args
          .splice(firstFlagIndex)
          .join(" ")
          .split("--")
          .map((s) => s.trim().split(/[ \t]+/));
        const flags = {};

        await Promise.all(
          allFlags.map(async ([name, ...flagArgs]) => {
            const flagOption = context.command.flags.find(
              (f) => f.name === name || (f.aliases && f.aliases.includes(name))
            );
            if (!flagOption) return;

            const value = await this.parseParameter(context, {
              name,
              parameter: flagOption,
              value: flagArgs.join(" "),
              flag: true,
              type: flagOption.type,
            });
            // @ts-ignore
            flags[flagOption.name] = value;
          })
        );

        context.setFlags(flags);
      }
    }

    const output = {};
    let argIndex = 0;
    for (let index = 0; index < context.command.parameters.length; index++) {
      const parameter = context.command.parameters[index];

      if (
        context.command.parameters.length > args.length &&
        !parameter.required &&
        argIndex === args.length - 1 &&
        context.command.parameters.some((p, pi) => pi > index && p.required)
      )
        continue;
      let arg: string = args[argIndex];

      if (parameter.full)
        arg = args.slice(argIndex).join(parameter.joinString ?? " ");

      // eslint-disable-next-line no-await-in-loop
      const value = await this.parseParameter(context, {
        name: parameter.name,
        parameter,
        value: arg,
        flag: false,
        type: parameter.type,
      });
      Object.defineProperty(output, parameter.name, { value });
      argIndex++;
    }

    return output;
  }

  static async handleSlash(context: SlashCommandContext): Promise<object> {
    const output = {};

    if (context.interaction.isContextMenuCommand()) {
      if (context.interaction.isMessageContextMenuCommand()) {
        let flag = false;
        let parameter = context.command.parameters.find(
          (c) => c.type === "message"
        );
        if (!parameter) {
          flag = true;
          parameter = context.command.flags.find((c) => c.type === "message");
        }
        if (!parameter) return output;
        const value = await this.parseParameter(context, {
          name: parameter.name,
          type: "message",
          value: context.interaction.targetMessage,
          parameter,
          flag,
        });
        Object.defineProperty(output, parameter.name, { value });
      } else if (context.interaction.isUserContextMenuCommand()) {
        let flag = false;
        let parameters = context.command.parameters.filter((c) =>
          ["user", "member"].includes(c.type)
        );
        if (parameters.length <= 0) {
          flag = true;
          parameters = context.command.flags.filter((c) =>
            ["user", "member"].includes(c.type)
          );
        }
        if (parameters.length <= 0) return output;
        const userParameter = parameters.find((p) => p.type === "user");
        if (userParameter) {
          const value = await this.parseParameter(context, {
            name: userParameter.name,
            type: "user",
            value: context.interaction.targetUser,
            parameter: userParameter,
            flag,
          });
          Object.defineProperty(output, userParameter.name, { value });
        }
        if (context.interaction.targetMember) {
          const memberParameter = parameters.find((p) => p.type === "member");
          if (memberParameter) {
            const value = await this.parseParameter(context, {
              name: memberParameter.name,
              type: "member",
              value: context.interaction.targetMember,
              parameter: memberParameter,
              flag,
            });
            Object.defineProperty(output, memberParameter.name, { value });
          }
        }
      }
    } else if (context.interaction.isChatInputCommand()) {
      const options: Option[] = [];

      const handleOption = (data: CommandInteractionOption<CacheType>): any => {
        if (data.options?.length) return data.options.map(handleOption);
        let flag = false;
        let parameters = context.command.parameters.filter(
          (p) => p.name === data.name
        );
        if (parameters.length <= 0) {
          flag = true;
          parameters = context.command.flags.filter(
            (f) =>
              f.name === data.name || (f.slashName && f.slashName === data.name)
          );
        }
        if (parameters.length <= 0) return;
        parameters.map((parameter) => {
          if (parameter.type === "booleanFlag") {
            return options.push({
              name: data.name,
              type: "booleanFlag",
              value: data.value,
              parameter,
              flag,
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          return handleParameterData(data, parameter, flag);
        });
      };

      // eslint-disable-next-line no-inner-declarations
      function handleParameterData(
        data: CommandInteractionOption<CacheType>,
        parameter: CommandParameter,
        flag: boolean
      ) {
        switch (data.type) {
          case ApplicationCommandOptionType.Attachment:
            options.push({
              name: data.name,
              type: "attachment",
              value: data.attachment,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.Boolean:
            options.push({
              name: data.name,
              type: "boolean",
              value: data.value,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.Channel:
            options.push({
              name: data.name,
              type: "channel",
              value: data.channel,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.Number:
          case ApplicationCommandOptionType.Integer:
            options.push({
              name: data.name,
              type: "number",
              value: data.value,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.Mentionable: {
            if (parameter.type === "role" && data.role)
              options.push({
                name: data.name,
                type: "role",
                value: data.role,
                parameter,
                flag,
              });
            if (parameter.type === "member" && data.member)
              options.push({
                name: data.name,
                type: "member",
                value: data.member,
                parameter,
                flag,
              });
            if (parameter.type === "user" && data.user)
              options.push({
                name: data.name,
                type: "user",
                value: data.user,
                parameter,
                flag,
              });
            break;
          }
          case ApplicationCommandOptionType.Role:
            options.push({
              name: data.name,
              type: "role",
              value: data.role,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.String:
            options.push({
              name: data.name,
              type: "string",
              value: data.value,
              parameter,
              flag,
            });
            break;
          case ApplicationCommandOptionType.User:
            options.push({
              name: data.name,
              type: "user",
              value: data.user,
              parameter,
              flag,
            });
            break;
        }
      }
      context.interaction.options.data.map(handleOption);

      const flags = {};
      await Promise.all(
        options.map(async (option) => {
          const value = await this.parseParameter(context, option);
          // @ts-ignore
          (option.flag ? flags : output)[option.parameter.name] = value;
        })
      );
      context.setFlags(flags);
    }

    return output;
  }

  private static async parseParameter(context: CommandContext, option: Option) {
    // @ts-ignore
    const config = Configs[option.parameter.type];
    const opts = config.generateOptions(option.parameter);
    const result = config.parseOption(context, option, opts);
    if (result instanceof Promise) await result;
    return result;
  }
}

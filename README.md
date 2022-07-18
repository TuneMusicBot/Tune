[![DeepSource](https://deepsource.io/gh/TuneMusicBot/Tune.svg/?label=active+issues&show_trend=true&token=zs9Ssd6AYhmmqWsKHQ1pELTl)](https://deepsource.io/gh/TuneMusicBot/Tune/?ref=repository-badge) [![GitHub issues](https://img.shields.io/github/issues/TuneMusicBot/Tune.svg)](https://GitHub.com/TuneMusicBot/Tune/issues/) [![GitHub contributors](https://badgen.net/github/contributors/TuneMusicBot/Tune)](https://GitHub.com/TuneMusicBot/Tune/graphs/contributors/)

# 📼 Tune

Tune is a brazilian [Discord](https://discord.com) music bot, built with [Node.js](https://nodejs.org), [TypeScript](https://www.typescriptlang.org/), [discord.js](https://discord.js.org) and [Prisma](https://prisma.io).

## 🔩 Self Hosting

> 💢 Support for self instances will not be given, and if a issue is opened about that will be closed immediately

1. Create a [Discord application](https://discord.com/developers/applications).
2. Install Node.js v16.9.0 or newer.
3. Fork or clone this repository.
4. Install dependecies using `yarn`. *(you doesn't need to use necessarily yarn but is recommended)*
5. Generate the Prisma Client using `yarn prisma:generate`.
6. Compile the TypeScript files using `yarn build`.
7. Rename `.env.example` to `.env` and fill out the values. *(for NODES value use the next topic to help you out with that)*
8. Run the bot with `yarn start` and be happy :)

## 🎶 Running a lavalink instance

> For playing songs and record audio we use an edited lavalink version. (You can found it clicking [here](https://github.com/TuneMusicBot/lavalink))

> ⚠️ To run this lavalink version is needed Java 11 or newer.

1. Download the latest Lavalink.jar file at releases and the application.yml.example.
2. Rename the application.yml.example to application.yml and fill out the values.
3. Open you terminal **at the same folder** of the lavalink file and application.yml.
4. Run `java -jar Lavalink.jar` and be happy :)

This project is licensed under the [AGPL-3.0](https://github.com/TuneMusicBot/Tune/blob/master/LICENSE) license.
Made with ❤ by Weariful#1234
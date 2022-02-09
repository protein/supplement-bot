"use strict";
// ----------------------------------------------------------------------------------//
// Main
// Discord Curation Bot (( BETA v0.1.0 ))
// Fiigmnt | November 11, 2021 | Updated: January 17, 2022
// ----------------------------------------------------------------------------------//
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client_1 = require("@notionhq/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { DISCORD_TOKEN, NOTION_TOKEN, NOTION_DB: databaseId } = process.env;
const notion = new client_1.Client({
    auth: NOTION_TOKEN,
});
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.Intents.FLAGS.GUILDS,
        discord_js_1.Intents.FLAGS.GUILD_MESSAGES,
        discord_js_1.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"],
});
client.once("ready", () => {
    console.log("Bot is ready");
});
const supplementChannelIds = () => {
    return supplementChannels.map((channel) => channel.id);
};
const capitalize = (word) => {
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
};
const isSupplementReaction = ({ message, reaction, }) => {
    if (supplementChannelIds().includes(message.channelId) &&
        reaction.emoji.name === "📌")
        return true;
    return false;
};
const findUrlHost = (url) => {
    if (url) {
        const fullHost = url
            .substring(url.indexOf("//") + 2)
            .substring(0, url.substring(url.indexOf("//") + 2).indexOf("/"));
        const hostElements = fullHost.split(".");
        if (hostElements.length === 3) {
            return capitalize(hostElements[1]);
        }
        return capitalize(hostElements[0]);
    }
    return "Unavailable";
};
const addItemToNotion = (row) => __awaiter(void 0, void 0, void 0, function* () {
    if (!databaseId) {
        console.log("No Database Connection!");
        return;
    }
    try {
        const response = yield notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                Message: {
                    title: [
                        {
                            text: {
                                content: row.content,
                            },
                        },
                    ],
                },
                "Shared by": {
                    rich_text: [
                        {
                            text: {
                                content: row.sharedBy,
                            },
                        },
                    ],
                },
                Source: {
                    rich_text: [
                        {
                            text: {
                                content: row.source,
                            },
                        },
                    ],
                },
                Category: {
                    select: {
                        name: row.category,
                    },
                },
                Sent: {
                    date: {
                        start: row.sent,
                    },
                },
            },
        });
        console.log(response);
        console.log("Success! Entry added.");
    }
    catch (error) {
        console.error(error);
    }
});
// Check for pin emoji reaction
client.on("messageReactionAdd", (reaction) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    if (reaction.partial) {
        // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
        try {
            yield reaction.fetch();
        }
        catch (error) {
            console.error("Something went wrong when fetching the message:", error);
            return;
        }
    }
    const message = reaction.message;
    if (isSupplementReaction({ message, reaction })) {
        try {
            // Create data object
            const row = {
                content: message.content,
                sharedBy: `${(_a = message.author) === null || _a === void 0 ? void 0 : _a.username}#${(_b = message.author) === null || _b === void 0 ? void 0 : _b.discriminator}`,
                title: (_c = message.embeds[0]) === null || _c === void 0 ? void 0 : _c.title,
                source: findUrlHost((_d = message.embeds[0]) === null || _d === void 0 ? void 0 : _d.url),
                category: (_e = supplementChannels.find((channel) => channel.id === message.channelId)) === null || _e === void 0 ? void 0 : _e.name,
                sent: message.createdAt,
            };
            yield addItemToNotion(row);
        }
        catch (error) {
            console.log(error);
        }
    }
}));
client.login(DISCORD_TOKEN);
const supplementChannels = [
    {
        id: "883148800263335946",
        name: "misc",
        emoji: "👍",
    },
    {
        id: "906917872855576616",
        name: "reports",
        emoji: "📖",
    },
    {
        id: "916288833597898803",
        name: "food",
        emoji: "🥨",
    },
    {
        id: "916288533004693534",
        name: "music",
        emoji: "🔈",
    },
    {
        id: "918072699174137886",
        name: "design",
        emoji: "🪑",
    },
    {
        id: "916287367420199002",
        name: "fashion",
        emoji: "✂",
    },
    {
        id: "937829535569825863",
        name: "home",
        emoji: "🧢",
    },
    {
        id: "930976788706918431",
        name: "nature",
        emoji: "🌱",
    },
    {
        id: "930985677158514778",
        name: "travel",
        emoji: "⛱",
    },
    {
        id: "919534316273426462",
        name: "spirituality",
        emoji: "💜",
    },
    {
        id: "930977865015640115",
        name: "natural-highs",
        emoji: "🍄",
    },
    {
        id: "933120844186664971",
        name: "books",
        emoji: "📚",
    },
    {
        id: "930979701042868286",
        name: "gaming",
        emoji: "👾",
    },
    {
        id: "896334201102692352",
        name: "daos",
        emoji: "🙌",
    },
    {
        id: "895991383733714965",
        name: "nfts",
        emoji: "✨",
    },
    {
        id: "909561580386136085",
        name: "metaverse",
        emoji: "💫",
    },
    {
        id: "908647992670711838",
        name: "blockchain",
        emoji: "⛓",
    },
];

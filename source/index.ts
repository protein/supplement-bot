// ----------------------------------------------------------------------------------//
// PRTN
// SUPPLEMENT Bot (( BETA v0.1.0 ))
// Fiigmnt | Febuary 8, 2022 | Updated:
// ----------------------------------------------------------------------------------//

import {
  Client,
  Intents,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
} from "discord.js";
import Airtable from "airtable";
import dotenv from "dotenv";

dotenv.config();

const { DISCORD_TOKEN, AIRTABLE_TOKEN, AIRTABLE_TABLE_KEY } = process.env;

const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(
  AIRTABLE_TABLE_KEY || ""
);
const supplementTable = base("Supplement");
const shareTable = base("Sharers");

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});

client.once("ready", () => {
  console.log("Bot is ready");
});

const supplementChannelIds = (): Array<string> => {
  return supplementChannels.map((channel) => channel.id);
};

const capitalize = (word: string): string => {
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
};

const isSupplementReaction = ({
  message,
  reaction,
}: {
  message: Message | PartialMessage;
  reaction: MessageReaction | PartialMessageReaction;
}): boolean => {
  if (
    supplementChannelIds().includes(message.channelId) &&
    reaction.emoji.id === "940946234741510154" &&
    reaction.message.author
  )
    return true;
  return false;
};

const findUrlHost = (url: string | null): string => {
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

const addItemToAirtable = async (row: any) => {
  // get users from user table:
  const results = await shareTable
    .select({
      // TODO: update to use discord id
      filterByFormula: `{Discord handle} = "${row.sharedBy.handle}"`,
    })
    .firstPage();

  let userId = results[0]?.id;

  if (!userId) {
    // create user in table
    console.log(`INFO: User ${row.sharedBy.handle} not found. Creating...`);
    const result = await shareTable.create([
      {
        fields: {
          "Discord handle": row.sharedBy.handle,
          "Discord ID": row.sharedBy.id,
        },
      },
    ]);
    userId = result[0].getId();
  }

  // create record in db
  await supplementTable.create([
    {
      fields: {
        "Title": row.title,
        "Message": row.message,
        "Link": row.link,
        "Shared by": [userId],
        "Source": row.source,
        "Category": row.category,
        "Sent": row.sent,
        // "Tagged by 🤖": row.taggedBy,
      },
    },
  ]);
};

// Check for pin emoji reaction
client.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) {
    // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("Something went wrong when fetching the message:", error);
      return;
    }
  }
  const message = reaction.message;
  if (isSupplementReaction({ message, reaction })) {
    if (message.author) {
      try {
        // Create data object
        const row = {
          title: message.embeds[0]?.title,
          message: message.content,
          link: message.embeds[0]?.url,
          sharedBy: {
            id: message.author.id,
            handle: `${message.author.username}#${message.author.discriminator}`,
            // handle: "Will | PRTN#7786",
          },
          source: findUrlHost(message.embeds[0]?.url),
          category: supplementChannels.find(
            (channel) => channel.id === message.channelId
          )?.name,
          sent: message.createdAt,
          taggedBy: `${user.username}#${user.discriminator}`,
        };
        console.log(`---------- ADDING ROW -----------`);
        console.log(row);

        await addItemToAirtable(row);
      } catch (error) {
        console.log(error);
      }
    } else {
      console.log("ERROR: Could not find message author");
    }
  }
});

client.login(DISCORD_TOKEN);

type SupplementChannel = {
  id: string;
  name: string;
  emoji: string;
};

const supplementChannels: Array<SupplementChannel> = [
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

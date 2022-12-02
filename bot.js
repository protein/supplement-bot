import {
  Client,
  IntentsBitField,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import Airtable from "airtable";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import {logger} from "./infrastructure/logger/index.js";
import {utility} from "./infrastructure/utility/index.js";

dayjs.extend(utc)
dayjs.extend(isBetween)

logger.info(`[0/5]: Executing bot script.`)

const base = connectToAirtableBase(process.env['AIRTABLE_TOKEN'], process.env['AIRTABLE_TABLE_KEY'])
const supplementTable = base("Supplement")
const sharersTable = base("Sharers")

logger.info(`[1/5]: Successfully connected to Airtable API.`)

function connectToAirtableBase(token, key) {
  try {
    return new Airtable({apiKey: token}).base(key)
  }
  catch (e) {
    throw e
  }
}

const messageCollectors = new Map()
const client = new Client({
  intents: [
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.MessageContent
  ],
  partials: [
    Partials.Reaction,
    Partials.Message,
    Partials.Channel,
    Partials.User,
    Partials.GuildMember
  ]
})

client.once('ready', () => logger.info(`[2/5]: Successfully connected to Discord API.`))
client.on('channelUpdate', updateMessageCollectors)
client.on('channelDelete', updateMessageCollectors)
client.on('channelCreate', updateMessageCollectors)
client.on('interactionCreate', handleCommand)

await client.login( process.env['DISCORD_TOKEN'] )

const registerBotCommandsResult = await registerBotCommands(process.env['DISCORD_TOKEN'], process.env['DISCORD_BOT_ID'])
logger.info(`[3/5]: Successfully registered ${registerBotCommandsResult.length} Discord bot commands.`)

const guild = await client.guilds.fetch( process.env['DISCORD_GUILD_ID'] )
logger.info(`[4/5]: Successfully connected to Discord server ${guild.name}.`)

let category = null;
await fetchSupplementChannels()
await registerMessageCollectors()
logger.info(`[5/5]: Observing reactions in ${category.children.cache.map(channel => channel.name).join(', ')} channels.`)

async function registerBotCommands(token, id) {
  return await new REST()
    .setToken(token)
    .put(Routes.applicationCommands(id), {
      body: [
        new SlashCommandBuilder()
          .setName('sync')
          .setDescription('Fetch pilled messages in this channel and synchronise with supplement data.')
      ]
      .map(command => command.toJSON())
    })
}

async function fetchSupplementChannels() {
  category = await guild.channels.fetch( process.env['DISCORD_CATEGORY_ID'] )
}

async function updateMessageCollectors() {
  // stop all message collectors
  for (const [channelId, messageCollector] of messageCollectors) {
    messageCollector.stop()
  }

  await fetchSupplementChannels()
  await registerMessageCollectors()
}

async function registerMessageCollectors() {
  category.children.cache.map(channel => {
    const messageCollector = channel.createMessageCollector({filter: m => true})
    messageCollector.on('collect', registerReactionCollector)

    messageCollectors.set(channel.id, messageCollector)
  })
}

const reUrl = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?/gim
const reactionCollectorFilter = async (reaction, user) => {
  if (reaction.message.guildId !== guild.id) {
    return false;
  }
  const member = await reaction.message.guild.members.fetch(user.id)
  const matches = reaction.message.embeds.length > 0 ? [reaction.message.embeds[0].url] : reaction.message.content.match(reUrl)
  return reaction.message.author
    && reaction.emoji.id === process.env['DISCORD_EMOJI_ID']
    && matches && matches.length > 0
    && isDiscordRoleValid(member.roles.cache)
};
async function registerReactionCollector(message) {
  logger.info(`Collected message "${message.id}" "${message.content.slice(0, 30)}..."`)

  const collector = message.createReactionCollector({filter: reactionCollectorFilter})
  collector.on('collect', handlePill)
}

async function handlePill(reaction, user) {
  logger.info(`[1/3]: Collected pill for the message "${reaction.message.id}" "${reaction.message.content.slice(0, 30)}..."`)

  const taggers = [{discordId: user.id, discordUsername: user.username + '#' + user.discriminator}]
  const payload = await constructPayload(reaction.message, taggers)

  logger.info(`[2/3]: Created payload "${JSON.stringify(payload).slice(0, 60)}..."`)

  const result = await addSupplementToAirtable(payload)

  if (result.id) {
    logger.info('[3/3]: Successfully saved into Airtable.')
  }
}

async function isSupplementMessage(msg, start, end) {
  const validReactionObject = msg.reactions.cache.filter(reaction => reaction.emoji.id === process.env['DISCORD_EMOJI_ID'])
  if (validReactionObject.size < 1) {
    return false;
  }

  if (!msg.author || dayjs.utc(msg.createdTimestamp).isBetween(start, end) !== true) {
    return false;
  }

  const matches = msg.embeds.length > 0 ? [msg.embeds[0].url] : msg.content.match(reUrl)
  if (!Array.isArray(matches) || (Array.isArray(matches) && matches.length < 1)) {
    return false;
  }

  const reaction = validReactionObject.get(process.env['DISCORD_EMOJI_ID'])
  await reaction.users.fetch()
  const taggers = (await Promise.all(Array.from(reaction.users.cache.values()).map(async (user) => {
    const member = await reaction.message.guild.members.fetch(user.id)
    return {
      discordId: user.id,
      discordUsername: user.username + '#' + user.discriminator,
      hasValidRole: isDiscordRoleValid(member.roles.cache)
    }
  }))).filter(o => o.hasValidRole === true)
  if (!Array.isArray(taggers) || (Array.isArray(taggers) && taggers.length < 1)) {
    return false;
  }

  return taggers
}
async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'sync' && interaction.guildId === guild.id) {
    const channel = await guild.channels.fetch(interaction.channelId)
    logger.info(`[1/3]: Syncing messages in #${channel.name}`)

    interaction.deferReply({ ephemeral: true })

    const end = dayjs.utc()
    const start = end.subtract(45, 'days')

    const records = (await supplementTable
      .select({
        filterByFormula: `AND(IS_AFTER({Sent}, "${start.toISOString()}"), IS_BEFORE({Sent}, "${end.toISOString()}"))`,
        maxRecords: 100,
        fields: ['fldfVhHHPaWV5OqQH', 'fldQaUJPRrlmUb4ge'] // Title, [BOT] Discord Message Id
      })
      .firstPage())
      .map(r => ({discordMessageId: r.get('[BOT] Discord Message Id') || '', title: r.get('Title')}))

    logger.info(`[2/3]: Found ${records.length} records in Airtable for the current month`)

    const report = {
      alreadySynced: 0,
      synced: 0,
      nonRecognized: records.filter(r => r.discordMessageId.length === 0).length
    }

    const allMessages = await channel.messages.fetch({before: channel.lastMessageId, limit: 100})
    const messages = (await Promise.all(allMessages.map(async (msg) => {
      const taggers = await isSupplementMessage(msg, start, end)
      if (taggers === false) {
        return false;
      }

      const payload = await constructPayload(msg, taggers)

      if (records.filter(r => r.discordMessageId === payload.id).length > 0) {
        report.alreadySynced += 1;
      }
      else {
        const result = await addSupplementToAirtable(payload)
        if (result.id) {
          report.synced += 1;
          logger.info('Successfully saved into Airtable.')
        }
      }

      return payload
    }))).filter(msg => msg)
    logger.info(`[3/3]: Found ${messages.length}/${allMessages.size} messages as supplement in #${channel.name} channel.`)

    // Send sync results
    const content = `The #${channel.name} sync report for the current month:\n\n` +
      (messages.length === 0 ?
        `✅ There aren't any messages tagged as supplement.\n` :
        `✅ ${messages.length} messages tagged as supplement from ${allMessages.size} messages.\n`) +
      `` +
      (report.synced === 0 ?
        `✅ All messages are in sync with Airtable.`:
        `✅ Synced ${report.synced} supplement messages which wasn't in Airtable`) + `\n` +
      (report.nonRecognized > 0 ?
        `👀 ${report.nonRecognized} messages in Airtable not recognized as they have no match with messages on Discord, FYI.\n` :
        ``) + `\n` +
      `Thanks 👋`
    return await interaction.editReply({content: content, ephemeral: true})
  }
}

async function constructPayload(message, taggers) {
  const reaction = message.reactions.cache
    .filter(reaction => reaction.emoji.id === process.env['DISCORD_EMOJI_ID'])
    .get(process.env['DISCORD_EMOJI_ID'])
  const hasEmbed = message.embeds.length > 0
  const matches = hasEmbed ? [message.embeds[0].url] : message.content.match(reUrl)

  return {
    id: message.id,
    title: hasEmbed ? message.embeds[0].title : '',
    link: matches[0],
    comment: message.content,
    sharer: {
      discordId: message.author.id,
      discordUsername: message.author.username + '#' + message.author.discriminator
    },
    source: utility.toUpperCaseFirst(utility.getHostName(matches[0])),
    channel: message.channel.name,
    timestamp: message.createdTimestamp,
    taggers: taggers,
    votes: {
      count: reaction.count
    }
  }
}

async function addSupplementToAirtable(payload) {
  // verify sharer
  try {
    const records = await sharersTable
      .select({
        filterByFormula: `{Discord ID} = "${payload.sharer.discordId}"`,
        maxRecords: 1,
        fields: ['fldntWaLxEXT7cmEN', 'fldss8lAkB9PZ1hdp'] // Discord ID, Discord handle
      })
      .firstPage()

    if (records.length === 0) {
      logger.info(`Adding ${payload.sharer.discordUsername} to the Sharers table.`)

      const newSharerResults = await sharersTable.create([{
        fields: {
          'Discord handle': payload.sharer.discordUsername,
          'Discord ID': payload.sharer.discordId
        }
      }])

      logger.info(`New sharer ${payload.sharer.discordUsername} created successfully with Airtable id: ${newSharerResults[0].getId()}`)

      payload.sharer.airtableId = newSharerResults[0].getId()
    }
    else {
      logger.info(`The sharer ${payload.sharer.discordUsername} found in Sharers table.`)

      payload.sharer.airtableId = records[0].getId()
    }
  }
  catch (e) {
    // TODO log to sentry
    logger.error(e, `Failed to verify sharer in Airtable. Message couldn't be saved.`)

    return e
  }

  // add supplement
  try {
    const supplement = await supplementTable.create([{
      fields: {
        'Title': payload.title,
        'Link': payload.link,
        'Shared by': [payload.sharer.airtableId],
        'Tagged by': payload.taggers[0].discordUsername,
        'Sent': dayjs.utc().toISOString(),
        'Message': payload.comment,
        'Source': payload.source,
        'Category': channelNameToCategory(payload.channel),
        '[BOT] Discord Message Id': payload.id
      }
    }], {typecast: true}) // typecast set to true to enable creation of non-exist categories

    return supplement.map(s => ({id: s.id}))[0]
  }
  catch (e) {
    // TODO log to sentry
    logger.error(e, 'Failed to add payload to Airtable.')

    return e
  }
}

function isDiscordRoleValid(collection) {
  // validates the tagger
  const list = process.env['DISCORD_ROLE_IDS'].split(',')
  return list[0] === '*' || list.filter(id => collection.has(id)).length > 0
}

function channelNameToCategory(channel) {
  const matches = channel.match(/[a-zA-Z0-9-]+/)
  return matches && matches.length > 0 ? matches[0] : ''
}

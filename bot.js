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

let supplementChannels = []
const messageCollectors = new Map()

const base = new Airtable({ apiKey: process.env['AIRTABLE_TOKEN'] }).base( process.env['AIRTABLE_TABLE_KEY'] )
const supplementTable = base("Supplement")
const sharersTable = base("Sharers")

const client = new Client({
  intents: [
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.MessageContent
  ],
  partials: [
    Partials.Reaction, Partials.Message, Partials.Channel, Partials.User, Partials.GuildMember
  ]
})

client.once('ready', () => {
  logger.info('Supplement is active.')
})

client.on('channelUpdate', fetchSupplementChannels)
client.on('channelDelete', fetchSupplementChannels)
client.on('channelCreate', fetchSupplementChannels)
client.on('interactionCreate', handleCommand)

await client.login( process.env['DISCORD_TOKEN'] )

new REST()
  .setToken( process.env['DISCORD_TOKEN'] )
  .put(Routes.applicationCommands(process.env['DISCORD_BOT_ID']), {
    body: [
      new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Fetch pilled messages in this channel and synchronise with supplement data.')
    ]
    .map(command => command.toJSON())
  })
  .then(result => logger.info(`Successfully registered ${result.length} bot commands.`))
  .catch(err => logger.error(err))

const guild = await client.guilds.fetch( process.env['DISCORD_GUILD_ID'] )
let category = await guild.channels.fetch( process.env['DISCORD_CATEGORY_ID'] )

await fetchSupplementChannels(guild, category)

async function fetchSupplementChannels() {
  category = await guild.channels.fetch( process.env['DISCORD_CATEGORY_ID'] )

  await registerMessageCollectors()
}

async function registerMessageCollectors() {
  // stop all message collectors
  for (const [channelId, messageCollector] of messageCollectors) {
    messageCollector.stop()
  }

  // collect all messages in supplement channels
  category.children.cache.map(channel => {
    const messageCollector = channel.createMessageCollector({filter: m => true})
    messageCollector.on('collect', registerReactionCollector)
    messageCollectors.set(channel.id, messageCollector)
  })
}

const reactionCollectorFilter = (reaction, user) => reaction.emoji.id === process.env['DISCORD_EMOJI_ID']
  && reaction.message.embeds.length > 0
  && reaction.message.author;
async function registerReactionCollector(message) {
  logger.info('Collected message ' + message.id)

  const collector = message.createReactionCollector({filter: reactionCollectorFilter})
  collector.on('collect', handlePill)
}

async function handlePill(reaction, user) {
  const payload = await constructPayload(reaction.message)

  logger.info(payload, 'Created payload:')

  const result = await addSupplementToAirtable(payload)

  if (result.id) {
    logger.info('Successfully saved into Airtable.')
  }
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'sync') {
    interaction.deferReply({ ephemeral: true })

    const start = dayjs.utc().startOf('month')
    const end = dayjs.utc().endOf('month')

    const records = (await supplementTable
      .select({
        filterByFormula: `AND(IS_AFTER({SENT}, "${start.toISOString()}"), IS_BEFORE({SENT}, "${end.toISOString()}"))`,
        maxRecords: 100,
        fields: ['fldfVhHHPaWV5OqQH', 'fldQaUJPRrlmUb4ge'] // Title, [BOT] Discord Message Id
      })
      .firstPage())
      .map(r => ({discordMessageId: r.get('[BOT] Discord Message Id') || '', title: r.get('Title')}))

    const channel = await guild.channels.fetch(interaction.channelId)
    logger.info(`Analyzing messages in #${channel.name}`)

    let allMessages = await channel.messages.fetch({limit: 100})
    const messages = await Promise.all(allMessages
      .filter(msg =>
        msg.embeds.length > 0 &&
        dayjs.utc(msg.createdTimestamp).isBetween(start, end) &&
        msg.reactions.cache.filter(reaction => reaction.emoji.id === process.env['DISCORD_EMOJI_ID']).size > 0)
      .map(msg => constructPayload(msg)))
    logger.info(`Found ${messages.length} messages as supplement from ${allMessages.size} messages in #${channel.name}`)
    const report = {
      alreadySynced: 0,
      synced: 0,
      nonRecognized: records.filter(r => r.discordMessageId.length === 0).length
    }
    await Promise.all(messages.map(async (message) => {
      if (records.filter(r => r.discordMessageId === message.id).length > 0) {
        report.alreadySynced += 1;
      }
      else {
        const result = await addSupplementToAirtable(message)
        if (result.id) {
          report.synced += 1;
          logger.info('Successfully saved into Airtable.')
        }
      }
      return Promise.resolve();
    }))

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

async function constructPayload(message) {
  const reaction = message.reactions.cache.filter(reaction => reaction.emoji.id === process.env['DISCORD_EMOJI_ID']).get(process.env['DISCORD_EMOJI_ID'])
  // fetch required for "/sync" command
  await reaction.users.fetch()
  const taggers = Array
    .from(reaction.users.cache.values())
    .map(user => ({discordId: user.id, discordUsername: user.username + '#' + user.discriminator}))

  return {
    id: message.id,
    title: message.embeds[0].title,
    link: message.embeds[0].url,
    comment: message.content,
    sharer: {
      discordId: message.author.id,
      discordUsername: message.author.username + '#' + message.author.discriminator
    },
    source: utility.toUpperCaseFirst(utility.getHostName(message.embeds[0].url)),
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

      const newSharer = await sharersTable.create([{
        fields: {
          'Discord handle': payload.sharer.discordUsername,
          'Discord ID': payload.sharer.discordId
        }
      }])

      payload.sharer.airtableId = newSharer.getId()
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
        'Category': payload.channel,
        '[BOT] Discord Message Id': payload.id
      }
    }])

    return supplement.map(s => ({id: s.id}))[0]
  }
  catch (e) {
    // TODO log to sentry
    logger.error(e, 'Failed to add payload to Airtable.')

    return e
  }
}

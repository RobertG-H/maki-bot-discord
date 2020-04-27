const env = process.env.NODE_ENV || 'development';

const Discord = require('discord.js');
const client = new Discord.Client();
const defaultSiteURL = 'https://www.reddit.com/r/Pixiv/new/.json?limit=50';
const defaultTextChannel = 'anime-pics';
const prefix = '~';
const githubRepo = 'https://github.com/RobertG-H/maki-bot-discord/blob/master/README.md'

// Postgres things
const Pool = require('pg').Pool
let connectionString = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: 5432,
};
// checking to know the environment and suitable connection string to use
// if (env === 'development') {
//     // connectionString.database = secrets.database;
// } else {
//     console.log('Loading non dev database connection string');
//     connectionString = {
//         connectionString: process.env.DATABASE_URL,
//         ssl: true
//     };
// };

const pool = new Pool(connectionString);

// Bluebird for promises
var Promise = require("bluebird");

// HTTP
const axios = require('axios').default;
// const url = require('url');

// Scheduler
const cron = require('node-cron');

// const redditJsonPostLimit = 50;

// DATABASE FUNCTIONS
function createGuild(guild_id) {
    const website_url = defaultSiteURL
    const text_channel = defaultTextChannel

    pool.query('INSERT INTO guilds (guild_id, text_channel, website_url) VALUES ($1, $2, $3)', [guild_id, text_channel, website_url], (error, results) => {
        if (error) {
            return console.error('Error executing query', error.stack)
        }
        console.log(`Added new guild: ${guild_id}`);
    })
}

function getGuildTextChannel(guild_id) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT TEXT_CHANNEL FROM guilds WHERE GUILD_ID = $1::bigint', [guild_id], (error, results) => {
            if (error) {
                console.error('Error executing query', error.stack)
                reject(error.stack)
            }
            const text_channel = results.rows[0].text_channel;
            console.log(`Got: ${text_channel} from guild: ${guild_id}`);
            resolve(text_channel);
        })
    });
}

function getGuildWebstieUrl(guild_id) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT WEBSITE_URL FROM guilds WHERE GUILD_ID = $1::bigint', [guild_id], (error, results) => {
            if (error) {
                console.error('Error executing query', error.stack)
                reject(error.stack)
            }
            const website_url = results.rows[0].website_url;
            console.log(`Got: ${website_url} from guild: ${guild_id}`);
            resolve(website_url);
        })
    });
}

function updateGuildTextChannel(guild_id, new_text_channel) {
    pool.query('UPDATE guilds SET TEXT_CHANNEL = $1::text WHERE GUILD_ID = $2::bigint', [new_text_channel, guild_id], (error, results) => {
        if (error) {
            return console.error('Error executing query', error.stack)
        }
        console.log(`Updated text_channel in guild: ${guild_id} to: ${new_text_channel}`);
    })
}

function updateGuildWebsiteUrl(guild_id, new_website_url_raw) {
    const new_website_url = new_website_url_raw + '.json?limit=50';
    pool.query('UPDATE guilds SET WEBSITE_URL = $1::text WHERE GUILD_ID = $2::bigint', [new_website_url, guild_id], (error, results) => {
        if (error) {
            return console.error('Error executing query', error.stack)
        }
        console.log(`Updated website_url in guild: ${guild_id} to: ${new_website_url}`);
    })
}

function createImageUrl(guild_id, new_url) {
    pool.query('INSERT INTO images (url, guild_id) VALUES ($1, $2)', [new_url, guild_id], (error, results) => {
        if (error) {
            return console.error('Error executing query', error.stack)
        }
        console.log(`Added new image: ${new_url} for guild: ${guild_id}`);
    })
}

function checkImageUrl(guild_id, url_tocheck) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT EXISTS(SELECT 1 FROM images WHERE URL = $1::text AND GUILD_ID = $2::bigint) AS "exists"', [url_tocheck, guild_id], (error, results) => {
            if (error) {
                console.error('Error executing query', error.stack)
                resolve(error.stack)
            }
            const urlExists = results.rows[0].exists;
            console.log(`Check worked! Image url existence is: ${urlExists}`);
            resolve(urlExists);
        })
    });

}

function deleteImageUrl(guild_id, url_todelete) {
    pool.query('DELETE FROM images WHERE URL = $1::text AND GUILD_ID = $2::bigint', [url_todelete, guild_id], (error, results) => {
        if (error) {
            return console.error('Error executing query', error.stack)
        }
        console.log(`Removed image: ${url_todelete} for guild: ${guild_id}`);
    })
}

// END DATABASE FUNCTIONS

// START BOT FUNCTIONS

function stayAwake() {
    console.log('I am awake!');
}

function postImageAllGuilds() {
    // Loop through all guilds and post image
    console.log("Running postImageAllGuilds()...");
    client.guilds.cache.forEach((guild) => {
        postImageGuild(guild)
    });
}

function postImageGuild(guild) {
    getGuildTextChannel(guild.id).then((channel_name) => {
        const channel = guild.channels.cache.find(channel => channel.name === channel_name)
        if (!channel) {
            console.log(`Error with guild: ${guild.id} invalid text channel name: ${channel_name}`);
        }
        else {
            getGuildWebstieUrl(guild.id).then((website_url) => {
                fetchImageUrl(website_url, guild.id).then((url) => {
                    console.log(`Posting image: ${url}`)
                    channel.send(url);
                })
            })
        }
    }).catch((error) => {
        console.log(error);
    });
}

function fetchImageUrl(website_url, guild_id) {
    // Make request for data
    return axios.get(website_url).then(function (response) {
        console.log(`Got a axios url response`);
        var siteData = response.data.data.children;
        var postIndex = 0;
        var imageURL = siteData[postIndex].data.url;
        var maxIndex = siteData.length - 1;
        var foundValidURL = false;

        var promiseWhile = Promise.method(function (condition, action) {
            if (!condition()) return;
            return action().then(promiseWhile.bind(null, condition, action));
        });

        return promiseWhile(function () {
            return !foundValidURL;
        }, function () {
            // Check if url is valid and that it hasn't been posted using the guild_id
            return checkURL(guild_id, imageURL).then((urlIsGood) => {
                if (urlIsGood) {
                    console.log(`url is good to go! ${imageURL}`);
                    // Add the URL to the database
                    createImageUrl(guild_id, imageURL);
                    foundValidURL = true;
                    return;
                }
                else {
                    console.log(`url is already used: ${imageURL}`);
                    postIndex += 1;
                    imageURL = siteData[postIndex].data.url;
                    if (postIndex >= maxIndex) foundValidURL = true;
                    return;
                }
            });
        }).then(function () {
            return imageURL;
        });


    }).catch(function (error) {
        console.log(`Axios url error with url:${website_url} ${error}`);
        reject(error);
    });
}

function checkURL(guild_id, url) {
    return new Promise((resolve, reject) => {
        // Must end in .jpg or .png
        if (!url.endsWith(".png") && !url.endsWith(".jpg")) {
            console.log('url does not end with .png or .jpg')
            resolve(false);
        }
        // Check the usedURL array if this URL has already been used.
        checkImageUrl(guild_id, url).then(function (exists) {
            resolve(!exists);
        })
    })

}

// END BOT FUNCTIONS

// START CLIENT BOT EVENTS

// Setup
client.once('ready', () => {
    console.log('Maki Bot Loaded!');
    client.user.setActivity('Domino\'s ft. Hatsune Miku');
});


// When joining a server
client.on("guildCreate", guild => {
    createGuild(guild.id)
    guild.systemChannel.send('Hiya! I am Maki-Bot! Use the "~help" command for a list of things you can do with me. よろしくね！');
    console.log(`Just joined: ${guild.name}`);
});


// Text commands
client.on('message', message => {
    if (message.author.bot) return;
    if (message.channel.type === "dm") return message.channel.send("Are you trying to DM me!? baka~~~~~~~~~~~");
    if (!message.content.startsWith(prefix)) return;

    let cmd = message.content.split(prefix)[1].toLowerCase();

    /* SECTION: COMMANDS */
    // HELP
    if (cmd === 'help') {
        message.channel.send(`Hiya! \n\nMy name is Makibot.I post photos from r / pixiv in the 'anime-pics' channel just for you at 8am EST and 8pm EST everyday(make sure you have the channel!) \n\nYou can see me other commands at: ${githubRepo} `);
    }
    // HELLO
    else if (cmd === 'hello') {
        message.channel.send("Hiya!");
    }
    // BOTINFO
    else if (cmd === 'botinfo' || cmd === 'info') {
        let bicon = client.user.displayAvatarURL();

        let botembed = new Discord.MessageEmbed()
            .setDescription("All about me!")
            .setColor("#db404a")
            .setThumbnail(bicon)
            .addField("List of commands", githubRepo)
            .addField("Fullname", 'Nishikino Maki')
            .addField("Blood Type", 'AB')
            .addField("Birthday", 'April 19');
        return message.channel.send(botembed);
    }
    // AUDIO
    else if (cmd === '自己紹介') {
        //console.log("Trying introduction...")
        var voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.channel.send("Fine... it's not like I even wanted you to be in a voice channel anyways!");
        }
        message.channel.send("はじめまして！");
        voiceChannel.join().then(connection => {
            const dispatcher = connection.play('./audio/intro.mp3');
            dispatcher.on("speaking", speaking => {
                if (!speaking) voiceChannel.leave();
            });
        }).catch(err => console.log(err));
    }
    else if (cmd === 'update') {
        message.channel.send(`You are updating my settings. Type '~channel' to update the channel I post to or type '~subreddit' to update the subreddit I get images from.`);
    }
    else if (cmd == 'channel') {
        message.channel.send(`You are updating the channel that I will post to.\nPlease type the channel name starting with "!"\nFor example: !anime-pics`);
        // Await !vote messages
        const filter = m => m.content.startsWith('!');
        // Errors: ['time'] treats ending because of the time limit as an error
        message.channel.awaitMessages(filter, { max: 1, time: 60000, errors: ['time'] })
            .then((collected) => {
                const iterator1 = collected.entries()
                const new_text_channel = iterator1.next().value.pop().content.split('!')[1]
                // console.log(message.guild.id)
                updateGuildTextChannel(message.guild.id, new_text_channel)
                message.channel.send("Updated channel");
            })
            .catch((collected) => {
                message.channel.send("Channel update timeout...")
            });
    }
    else if (cmd == 'subreddit') {
        message.channel.send(`You are updating the subreddit that I get images from.\nPlease type the full subreddit url starting with "!"\nFor example: !https://www.reddit.com/r/Pixiv/new/\nor\nhttps://www.reddit.com/r/awwnime/`);
        // Await !vote messages
        const filter = m => m.content.startsWith('!');
        // Errors: ['time'] treats ending because of the time limit as an error
        message.channel.awaitMessages(filter, { max: 1, time: 60000, errors: ['time'] })
            .then((collected) => {
                const iterator1 = collected.entries()
                const new_website_url = iterator1.next().value.pop().content.split('!')[1]
                console.log(message.guild.id)
                updateGuildWebsiteUrl(message.guild.id, new_website_url)
                message.channel.send("Updated subreddit");

            })
            .catch((collected) => {
                message.channel.send("Subreddit update timeout...")
            });
    }
    else if (cmd === 'post') {
        console.log("trying to post");
        sendPicture();
    }
    else if (cmd === 'trydb') {
        // createGuild(123);
        // updateGuildTextChannel(123, "test");
        // updateGuildWebsiteUrl(123, 'https://www.reddit.com/dev/api#GET_api_me.json');
        // createImageUrl(123, 'image.url')
        // checkImageUrl(123, 'image.url')
        // checkImageUrl(123, 'image.urll')
        // deleteImageUrl(123, 'image.url')
        // getGuildWebstieUrl(123)
        postImageAllGuilds();
    }
});

client.login(process.env.DISCORD_TOKEN);
// permissions interger: 3197952
// test bot: 
// https://discordapp.com/api/oauth2/authorize?client_id=634368719023374336&permissions=3263488&scope=bot

// Scheduler twice a day at 8AM and 8PM EST
cron.schedule('0 13,1 * * *', function () {
    sendPicture();
});

// Scheduler to keep bot from falling asleep. Pings it self every 10min.
cron.schedule('*/10 * * * *', function () {
    stayAwake();
});
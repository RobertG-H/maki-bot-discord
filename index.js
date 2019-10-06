const Discord = require('discord.js');
const client = new Discord.Client();
const siteURL = 'https://www.reddit.com/r/Pixiv/new/.json';
const backupSiteURL = 'https://www.reddit.com/r/awwnime/.json'
const prefix = '~';
const githubRepo = 'https://github.com/RobertG-H/MakiBot-Discord/'

// HTTP
const request = require('request');
const url = require('url');

// Scheduler
const cron = require('node-cron');

// Small list of already used urls
// Newer posts at the front of the array
let usedURLS = [];
let usedURLSMax = 14;


function clearPictures() {
    usedURLS = [];
    //console.log("URL history cleared.");
}


function postToAllChannels(url) {
    //console.log("POSTING...");
    // Setting all posting channels
    NotifyChannels = [];
    client.guilds.map((guild) => {
        guild.channels.map((channel) => {
            if (channel.type === 'text') {
                if(channel.name === 'anime-pics'){
                    //console.log(`Guild: ${guild.id} and channel: ${channel.name}`);
                    //NotifyChannels.push(channel);
                    channel.send(url);
                }
            }
        });
    });
}


function checkURL(url) {
    // Must end in .jpg or .png
    if (!url.endsWith(".png") && !url.endsWith(".jpg")) return false;
    // Check the usedURL array if this URL has already been used.
    for (var usedURL of usedURLS) {
        if (url === usedURL) return false;
    }
    return true;
}


function sendPicture() {
    //console.log("Before request...");
    request(siteURL, function(err, res, body){
        if (!err && res.statusCode == 200) {
            var importedJSON = JSON.parse(body);
            var postIndex = 0;
            var hasPosted = false;
            var imageURL = importedJSON.data.children[postIndex].data.url;
            var maxIndex = importedJSON.data.children.length - 1;

            if (usedURLS.length === 0) {
                usedURLS.unshift(imageURL);
                console.log(usedURLS);
                postToAllChannels(imageURL);
            }
            else {

                for (var i = 0; i < maxIndex; i++) {
                    //console.log(`Checking this url: ${imageURL}`);
                    if (checkURL(imageURL)) {
                        //console.log(`url is good to go! ${imageURL}`);
                        // Add the URL to the lis
                        usedURLS.unshift(imageURL);
                        // Keep usedURLS at a max length of 1 week (14 posts)
                        if (usedURLS.length >= usedURLSMax){
                          usedURLS.pop()
                        }
                        //console.log(usedURLS);
                        postToAllChannels(imageURL);
                        hasPosted = true;
                        break;
                    }
                    else {
                        //console.log(`url is already used: ${imageURL}`);
                        postIndex += 1;
                        imageURL = importedJSON.data.children[postIndex].data.url;
                    }
                }

                // If all posts have already been used then go to the backup
                if (!hasPosted) {
                    request(backupSiteURL, function(err, res, body){
                        if (!err && res.statusCode == 200) {
                            var importedJSON = JSON.parse(body);
                            var postIndex = 0
                            var imageURL = importedJSON.data.children[0].data.url;
                            console.log("Using backup post");
                            postToAllChannels(imageURL);
                        }
                        else {
                            console.log(`ERROR reading json from ${backupSiteURL}`);
                        }
                    });
                }
            }
        }
        else {
          console.log(`ERROR reading json from ${siteURL}`);
        }
    });
}


// Setup
client.once('ready', () => {
	console.log('Maki Bot Loaded!');
    client.user.setActivity('Domino\'s ft. Hatsune Miku');
});


// When joining a server
client.on("guildCreate", guild => {
    console.log(`Just joined: ${guild.name}`);
    //guild.channels[0].send('Hiya! I am Maki-Bot! Use the "~help" command for a list of things you can do with me. よろしく！');
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
        message.channel.send(`Hiya! \n\nMy name is Makibot. I post photos from r/pixiv in the 'anime-pics' channel just for you at 8am EST and 8pm EST everyday (make sure you have the channel!)\n\nYou can see me other commands at: ${githubRepo}`);
    }
    // HELLO
    else if (cmd === 'hello') {
        message.channel.send("Hiya!");
    }
    // BOTINFO
    else if (cmd === 'botinfo' || cmd === 'info'){
        let bicon = client.user.displayAvatarURL;
        let botembed = new Discord.RichEmbed()
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
        var voiceChannel = message.member.voiceChannel;
        if (!voiceChannel) {
            return message.channel.send("Fine... it's not like I even wanted you to be in a voice channel anyways!");
        }
        message.channel.send("はじめまして！");
        voiceChannel.join().then(connection =>
        {
           const dispatcher = connection.playFile('./audio/intro.mp3');
           dispatcher.on("end", end => {
             voiceChannel.leave();
             });
         }).catch(err => console.log(err));
    }
    // else if (cmd === 'post'){
    //     console.log("trying to post");
    //     sendPicture();
    // }
    // else if (cmd === 'clearhistory') {
    //     clearPictures();
    // }
});


client.login(process.env.DISCORD_TOKEN);

// Scheduler twice a day at 8AM and 8PM EST
cron.schedule('0 13,1 * * *', function(){
  sendPicture ();
});

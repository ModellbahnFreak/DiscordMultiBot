const https = require("https");
const http = require("http");
const settings = require("./settings");
const fs = require("fs");
const Discord = require("./discordApi");
const Speech = require("./discordSpeech");
var HueAPI;
if(settings.use_mqtt) {
    HueAPI = require("./mqttApi");
} else {
    HueAPI = require("./hueApi");
}

if (!settings.auth_token) {
    const oauthUrl = "https://discordapp.com/api/oauth2/authorize?response_type=token&client_id=" + settings.client_id + "&permissions=1677197120&redirect_uri=" + encodeURIComponent(settings.response_uri) + "&scope=bot";
    const webserverOptions = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };
    https.createServer(webserverOptions, function (req, res) {
        console.log(req.url);
        var recvData = "";
        var wasTokenRequest = false;
        req.on('data', (chunk) => {
            recvData += chunk.toString();
        });
        req.on('end', () => {
            if (wasTokenRequest) {
                fs.appendFileSync("token.txt", recvData + "\n-----------------------------\n");
            }
        });
        const splitUrl = req.url.split("?");
        if (splitUrl.length == 2) {
            const splitParams = splitUrl[1].split("&");
            splitParams.forEach(param => {
                const splitKeyVal = param.split("=");
                if (splitKeyVal.length == 2) {
                    if (splitKeyVal[0] == "access_token") {
                        wasTokenRequest = true;
                        console.log("Token: ", splitKeyVal[1]);
                        fs.appendFileSync("token.txt", splitUrl[1] + "\n");
                    }
                }
            });
        }
        res.writeHead(200);
        if (wasTokenRequest) {
            res.end("<!doctype html><html><head><title>Discord add 0x6849</title>" +
                "Bot was succesfully added to discord</body></html>");
        } else {
            res.end("<!doctype html><html><head><title>Discord add 0x6849</title>" +
                "<script>if (window.location.hash != \"\") {window.location.search=\"?\" + window.location.hash.substr(1);}</script>" +
                "</head><body><a href=\"" + oauthUrl + "\">Add Bot to Discord Server</a></body></html>");
        }
    }).listen(8000);
    console.log("Started Web server");
} else if (!settings.hue_bridge_key) {
    if (settings.hue_bridge_ip) {
        HueAPI.getApiKey(settings.hue_bridge_ip).then((key) => {
            console.log("Hue bridge API-Key: ", key)
        }).catch(reason => {
            console.error("Couldn't get the Hue API Key because ", reason);
        });
    } else {
        console.error("Please enter the ip addess of the hue bridge");
    }
} else {
    var knownUsers = {};
    var usersNum = 0;
    const hue = new HueAPI(settings.hue_bridge_ip, settings.hue_bridge_key);

    function calculateAndSetNewColor(user, active) {
        if (!knownUsers[user.id]) {
            if(settings.userColors[user.username]) {
                knownUsers[user.id] = { ...user, lamp_id: settings.lamp_id, color: settings.userColors[user.username], active: active };
            } else {
                knownUsers[user.id] = { ...user, lamp_id: settings.lamp_id, color: settings.lamp_colors[usersNum % settings.lamp_colors.length], active: active };
                usersNum++;
            }
        }
        knownUsers[user.id].active = active;
        var colorSum = {}
        var peopleTalking = {};
        for (const userId in knownUsers) {
            if (knownUsers.hasOwnProperty(userId)) {
                const user = knownUsers[userId];
                if (!colorSum[user.lamp_id]) {
                    colorSum[user.lamp_id] = { r: 0, g: 0, b: 0 };
                    peopleTalking[user.lamp_id] = 0;
                }
                if (user.active === true) {
                    colorSum[user.lamp_id].r += user.color.r;
                    colorSum[user.lamp_id].g += user.color.g;
                    colorSum[user.lamp_id].b += user.color.b;
                    peopleTalking[user.lamp_id]++;
                }
            }
        }
        for (const lamp in colorSum) {
            if (colorSum.hasOwnProperty(lamp)) {
                var color = colorSum[lamp];
                if (peopleTalking[lamp] != 0) {
                    color.r /= peopleTalking[lamp];
                    color.g /= peopleTalking[lamp];
                    color.b /= peopleTalking[lamp];
                }
                hue.setColorLight(lamp, color.r, color.g, color.b);
            }
        }
    }


    hue.loadAllLights().then(() => {
        hue.setColorLight(settings.lamp_id, 0, 0, 0);
    }).then(() => {
        const discord = new Discord(settings.bot_token);
        var activeChannels = {};
        discord.onmessagecreate = (data) => {
            if (data.d.guild_id) {
                if (data.d.content == settings.start_command) {
                    if (!activeChannels[data.d.channel_id]) {
                        activeChannels[data.d.channel_id] = {
                            playlist: ["test.wav"],
                            guild: data.d.guild_id
                        };
                        console.log("Added new server to known list");
                        discord.sendMessage("Hello guys!", data.d.channel_id);
                    } else {
                    }
                } else if (data.d.content == "/stop") {
                    if (activeChannels[data.d.channel_id]) {
                        activeChannels[data.d.channel_id] = undefined;
                        console.log("Server stopped");
                        discord.sendMessage("Goodbye", data.d.channel_id);
                    } else {
                    }
                } else if (data.d.content.startsWith(settings.join_command)) {
                    if (activeChannels[data.d.channel_id]) {
                        const parts = data.d.content.split(" ");
                        if (parts.length == 2) {
                            console.log("Joining voice channel " + parts[1]);
                            discord.sendMessage("Joining channel", data.d.channel_id);
                            discord.getVoiceChannelByName(data.d.guild_id, parts[1].trim(), (channel_id) => {
                                discord.openVoiceChannel(data.d.guild_id, channel_id);
                                discord.on("voiceInitiated", () => {
                                    discord.voiceConnection.on("speekstart", user => {
                                        if (user) {
                                            console.log(user.username + " started speaking");
                                            //if (!user.bot) {
                                            calculateAndSetNewColor(user, true);
                                            //}
                                        }
                                    });
                                    discord.voiceConnection.on("speekend", user => {
                                        if (user) {
                                            console.log(user.username + " stopped speaking");
                                            //if (!user.bot) {
                                            calculateAndSetNewColor(user, false);
                                            //}
                                        }
                                    });
                                })
                            });
                        } else {
                            discord.sendMessage("Please specify the channel name to join", data.d.channel_id);
                        }
                    } else {
                    }
                } else {
                    if (activeChannels[data.d.channel_id]) {
                        if (data.d.content.startsWith("/play")) {
                            var parts = data.d.content.split(" ");
                            for (var i = 1; i < parts.length; i++) {
                                discord.sendMessage("!play " + parts[i], data.d.channel_id);
                            }
                            activeChannels[data.d.channel_id].speech.play(test.wav);
                        }
                    } else {
                        console.log("Server-Message: " + data.d.content);
                    }
                }
            } else {
                console.log("Direct-Message: " + data.d.content)
            }
        }
        discord.connectToGateway();

        console.log("Startup complete");

        setTimeout(() => {
            discord.sendMessage("/start", "696841664802848788");
            setTimeout(() => {
                discord.sendMessage("/join uni-zeugs", "696841664802848788");
            }, 200);
        }, 3000);
    });
}

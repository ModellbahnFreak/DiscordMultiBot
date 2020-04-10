const https = require("https");
const WebSocket = require("ws");
const Discord = require("./discordApi");
const child_process = require("child_process");
const fs = require("fs");
const EventEmitter = require("events");

class DiscordSpeech extends EventEmitter {

    apiCon;
    voiceServer;
    voiceToken;
    voiceGuild;
    voiceChannel;
    voiceSocket;
    heartbeat_interval;
    lastHeartbeatCode;

    constructor(discord, serverUpdate, stateUpdate, authHead) {
        super();
        this.apiCon = discord;
        this.voiceServer = serverUpdate.endpoint;
        this.voiceToken = serverUpdate.token;
        this.voiceGuild = serverUpdate.guild_id;
        this.voiceChannel = stateUpdate.channel_id;
        this.voiceSession = stateUpdate.session_id;
        this.voiceUser = stateUpdate.user_id;

        var voiceServerUrl = new URL("wss://" + this.voiceServer + "?v=4");
        voiceServerUrl.port = 443;
        const voiceSocket = new WebSocket(voiceServerUrl, {
            //secureProtocol: 'TLSv2_method'
            headers: authHead
        });
        const voiceSelf = this;
        this.voiceSocket = voiceSocket;
        voiceSocket.on("open", () => {
            console.log("Voice Socket open");
            voiceSocket.send(JSON.stringify(
                {
                    "op": 0,
                    "d": {
                        "server_id": voiceSelf.voiceGuild,
                        "user_id": voiceSelf.voiceUser,
                        "session_id": voiceSelf.voiceSession,
                        "token": voiceSelf.voiceToken,
                    }
                }
            ));
            console.log("Op 0 sent");
        });
        voiceSocket.on("message", (data) => {
            const object = JSON.parse(data);
            if (object) {
                switch (object.op) {
                    case 2:
                        //Ready
                        console.log("Received voice ready");
                        break;
                    case 8:
                        //Hello
                        if (object.d && object.d.heartbeat_interval) {
                            voiceSelf.heartbeat_interval = object.d.heartbeat_interval;
                            const sendHeartbeat = () => {
                                if (voiceSocket && voiceSocket.readyState == WebSocket.OPEN) {
                                    voiceSelf.lastHeartbeatCode = Math.floor(new Date() / 1000);
                                    const heartbeatMsg = {
                                        "op": 3,
                                        "d": voiceSelf.lastHeartbeatCode
                                    };
                                    voiceSocket.send(JSON.stringify(heartbeatMsg));
                                    console.log("Sent voice heartbeat");
                                    setTimeout(sendHeartbeat, voiceSelf.heartbeat_interval);
                                }
                            }
                            sendHeartbeat();
                        }
                        break;
                    case 6:
                        if (object.d) {
                            if (object.d == voiceSelf.lastHeartbeatCode) {
                                console.log("Correct voice heartbeat answer");
                            } else {
                                console.error("Voice heartbeat answer wrong");
                            }
                        }
                        break;
                    case 5:
                        //console.log("speaking received");
                        if (object.d) {
                            if (object.d.speaking == 1) {
                                voiceSelf.emit("speekstart", voiceSelf.apiCon.getUserById(object.d.user_id));
                            } else if (object.d.speaking == 0) {
                                voiceSelf.emit("speekend", voiceSelf.apiCon.getUserById(object.d.user_id));
                            }
                        }
                        break;
                    default:
                        console.log("Received Voice: " + data);
                        break;
                }
            }
        });
        voiceSocket.on("close", (num, reason) => {
            console.log("Closed ", num, "; ", reason);
        });
    }

    connect() {

    }

    disconnect() {

    }

    play(filename) {//"-i", filename, 
        const ffmpeg = child_process.spawn("ffmpeg", ["-strict", "-2", "-v", "0", "-i", filename, "-ar", "48000", "-ac", "2", "-c:a", "libopus", "-b:a", "64K", "-c:v", "none", "-f", "opus", "-"]);
        var buffer;
        var numWritten = 0;
        ffmpeg.stdout.on("data", data => {
            /*if (!buffer) {
                buffer = data;
            } else {
                buffer = Buffer.concat([buffer, data]);
            }*/
            fs.appendFile("test" + numWritten + ".opus", data, () => { });
            numWritten++;
        });
        ffmpeg.stderr.on("data", data => {
            console.error(data.toString);
        });
        ffmpeg.on("close", (exitCode) => {
            if ((exitCode == 0 || exitCode == null) && buffer instanceof Buffer) {
                /*for (var i = 0; i < buffer.length / 8000.0; i++) {
                    fs.writeFile("test" + i + ".opus", buffer.slice(i * 8000, (i + 1) * 8000), () => {
                        console.log("Written");
                    });
                }*/
            }
            /*fs.writeFile("test.opus", buffer, () => {
                console.log("Written");
            });*/
            console.log("ffmpeg ended with ", exitCode);
        });
        setTimeout(() => {
            ffmpeg.kill();
        }, 10000);
    }
}

module.exports = DiscordSpeech;
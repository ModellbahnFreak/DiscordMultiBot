const https = require("https");
const WebSocket = require("ws");
const Speech = require("./discordSpeech");
const util = require("util");
const EventEmitter = require("events");

class DiscordAPI extends EventEmitter {

    static NOTHING = undefined;
    static VOICE_SERVER_INFO = 1;
    static USER_JOINING = 2;
    static base = "https://discordapp.com/api";
    heartbeat_interval;
    token;
    wsUrl;
    socket;
    lastSequence = null;
    authHead;
    voiceConnection;
    tempVoiceData;
    waitingFor;
    knownUsers = {};

    onmessagecreate = (data) => {
        console.log("New message: " + data.d.content);
    }

    constructor(apiToken) {
        super();
        this.token = apiToken;
        this.authHead = {
            "Authorization": "Bot " + this.token
        }
    }

    connectToGateway() {
        this.getRequest("/gateway?v=6?encoding=json", (res) => {
            if (res && res.url) {
                console.log("Websocket url: " + res.url);
                this.wsUrl = res.url;
                const socket = new WebSocket(this.wsUrl + "?v=6&encoding=json");
                const self = this;
                this.socket = socket;
                socket.on("open", () => {
                    console.log("WS open");
                });
                socket.on("message", (data) => {
                    console.log("Received: " + data);
                    const object = JSON.parse(data);
                    if (object) {
                        self.lastSequence = object.s;
                        switch (object.op) {
                            case 10:
                                self.identifyWebsocket(object);
                                break;
                            case 1:
                                socket.send(JSON.stringify({
                                    "op": 11
                                }));
                                break;
                            case 0:
                                switch (object.t) {
                                    case "MESSAGE_CREATE":
                                        self.onmessagecreate(object);
                                        break;
                                    case "VOICE_SERVER_UPDATE":
                                        console.log("Server update");
                                        if (self.waitingFor == DiscordAPI.VOICE_SERVER_INFO) {
                                            if (self.tempVoiceData) {
                                                self.initiateVoice(object)
                                            } else if (!self.tempVoiceData) {
                                                self.tempVoiceData = object;
                                            }
                                        }
                                        break;
                                    case "VOICE_STATE_UPDATE":
                                        if (self.waitingFor == DiscordAPI.VOICE_SERVER_INFO) {
                                            console.log("State update with voice server info");
                                            if (self.tempVoiceData) {
                                                self.initiateVoice(object)
                                            } else if (!self.tempVoiceData) {
                                                self.tempVoiceData = object;
                                            }
                                        }

                                        break;
                                    case "GUILD_CREATE":
                                        if (object.d.members) {
                                            object.d.members.forEach(member => {
                                                if (member.user && member.user.id && member.user.username) {
                                                    self.knownUsers[member.user.id] = member.user;
                                                    self.knownUsers[member.user.id].deaf = member.deaf;
                                                    self.knownUsers[member.user.id].mute = member.mute;
                                                    if (member.nick) {
                                                        self.knownUsers[member.user.id].nick = member.nick;
                                                    }
                                                }
                                            });
                                        }
                                        break;
                                }
                                break;
                        }
                    }
                });
                socket.on("close", (num, reason) => {
                    console.log("Closed ", num, "; ", reason);
                });
            }
        });
    }

    initiateVoice(object) {
        console.log("Initiating voice");
        this.waitingFor = DiscordAPI.NOTHING;
        if (object.t == "VOICE_STATE_UPDATE" && this.tempVoiceData.t == "VOICE_SERVER_UPDATE") {
            this.voiceConnection = new Speech(this, this.tempVoiceData.d, object.d, this.authHead);
            this.emit("voiceInitiated");
        } else if (object.t == "VOICE_SERVER_UPDATE" && this.tempVoiceData.t == "VOICE_STATE_UPDATE") {
            this.voiceConnection = new Speech(this, object.d, this.tempVoiceData.d, this.authHead);
            this.emit("voiceInitiated");
        } else {
            console.error("Error initiating voice connection");
        }
    }

    sendMessage(text, channel_id) {
        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            //this.getRequest("/channels/" + channel_id, console.log);
            var content = {
                "content": text,
                "nonce": Math.floor(Math.random() * 10000),
                "tts": false
            };
            this.postRequest("/channels/" + channel_id + "/messages", JSON.stringify(content), console.log, this.authHead);
        }
    }

    getVoiceChannelByName(guild_id, channelName, callback) {
        this.getRequest("/guilds/" + guild_id + "/channels", (object) => {
            //console.log(object);
            object.forEach(channel => {
                if (channel.type == 2 && channel.name.toLowerCase() == channelName.toLowerCase()) {
                    console.log("Channel id: ", channel.id);
                    if (callback) {
                        callback(channel.id);
                    }
                }
            });
        }, this.authHead);
    }

    getUserById(user_id) {
        if (!this.knownUsers[user_id]) {
            (async () => {
                var loadedData = await new Promise((resolve, fail) => {
                    this.getRequest("/users/" + user_id, resolve, this.authHead);
                });
                if (loadedData && loadedData.id && loadedData.username && loadedData.id == user_id) {
                    self.knownUsers[loadedData.id] = loadedData;
                }
            })();
        }
        return this.knownUsers[user_id];
    }

    openVoiceChannel(guild_id, channnel_id) {
        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            if (this.voiceConnection) {
                this.voiceConnection.disconnect();
                this.voiceConnection = undefined;
            }
            this.tempVoiceData = undefined;
            this.waitingFor = DiscordAPI.VOICE_SERVER_INFO;
            const updateVoiceStatus = {
                "op": 4,
                "d": {
                    "guild_id": guild_id,
                    "channel_id": channnel_id,
                    "self_mute": false,
                    "self_deaf": true
                }
            };
            console.log("Op 4: ", updateVoiceStatus);
            this.socket.send(JSON.stringify(updateVoiceStatus));
        }
    }

    identifyWebsocket(object) {
        this.heartbeat_interval = object.d.heartbeat_interval;
        const sendHeartbeat = () => {
            if (this.socket.readyState == WebSocket.OPEN) {
                console.log("Heart beat");
                this.socket.send(JSON.stringify({
                    "op": 1,
                    "d": this.lastSequence
                }));
                setTimeout(sendHeartbeat, this.heartbeat_interval);
            } else {
                console.log("Heartbeat not sent")
            }
        };
        var identify = JSON.stringify({
            "op": 2,
            "d": {
                "token": this.token,
                "properties": {
                    "$os": "linux",
                    "$browser": "0x6849-Bot",
                    "$device": "0x6849-Bot"
                },
                "presence": {
                    "game": {
                        "name": "VSCode-Debugger",
                        "type": 0
                    },
                    "status": "online",
                    "since": null,
                    "afk": false
                },
                "intents": 4737
            }
        });
        this.socket.send(identify);
        console.log("Identify sent");
        sendHeartbeat();
    }

    postRequest(url, bodyObject, callback, head) {
        const body = bodyObject;
        var options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        if (head) {
            for (const key in head) {
                if (head.hasOwnProperty(key)) {
                    options.headers[key] = head[key];
                }
            }
        }

        var recvData;
        const req = https.request(DiscordAPI.base + url, options, res => {
            //console.log('statusCode:', res.statusCode);
            //console.log('headers:', res.headers);

            res.on('data', (d) => {
                if (!recvData) {
                    recvData = d;
                } else {
                    recvData = Buffer.concat([recvData, d]);
                }
            });
            res.on('end', () => {
                if (callback) {
                    callback(JSON.parse(recvData.toString()));
                }
            });
        });
        req.on('error', (e) => {
            console.error(e);
        });
        req.write(body)
        req.end();
    }

    getRequest(url, callback, head) {
        var options = {
        };
        if (head) {
            options.headers = head;
            //console.log("Sending head: ", options.headers);
        }
        var recvData;
        const req = https.get(DiscordAPI.base + url, options, res => {
            console.log("Request ", url, " statusCode: ", res.statusCode);
            //console.log('headers:', res.headers);

            res.on('data', (d) => {
                if (!recvData) {
                    recvData = d;
                } else {
                    recvData = Buffer.concat([recvData, d]);
                }
            });
            res.on('end', () => {
                if (callback) {
                    callback(JSON.parse(recvData.toString()));
                }
            });
        });
        req.on('error', (e) => {
            console.error(e);
        });
    }
}

module.exports = DiscordAPI;
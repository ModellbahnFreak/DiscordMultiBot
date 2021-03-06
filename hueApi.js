const https = require("https");

class HueAPI {

    ip;
    key;
    options;
    knownLights = {};

    constructor(bridge_ip, api_key) {
        this.ip = bridge_ip;
        this.key = api_key;
        this.options = {
            host: this.ip,
            rejectUnauthorized: false,
        };
    }

    loadAllLights() {
        return new Promise((resolve, fail) => {
            this.getRequest("/lights").then(lights => {
                this.knownLights = lights;
                for (const key in this.knownLights) {
                    if (this.knownLights.hasOwnProperty(key)) {
                        var element = this.knownLights[key];
                    }
                }
                resolve(lights);
            }).catch(fail);
        });
    }

    setLightRgb(light_id, color) {
        this.setColorLight(light_id, color.r, color.g, color.b);
    }

    setColorLight(light_id, red, green, blue) {
        return new Promise((resolve, fail) => {
            red = Math.max(Math.min(red, 1), 0);
            green = Math.max(Math.min(green, 1), 0);
            blue = Math.max(Math.min(blue, 1), 0);
            if (this.knownLights[light_id]) {
                var light = this.knownLights[light_id];
                if (red == 0 && green == 0 && blue == 0) {
                    this.switchLightState(light_id, false).then(() => {
                        light.state.hue = 0;
                        light.state.sat = 0;
                        light.state.bri = 0;
                        light.state.r = 0;
                        light.state.g = 0;
                        light.state.b = 0;
                        resolve("#000000");
                    }).catch(fail);
                } else {
                    this.switchLightState(light_id, true).then(() => {
                        if (light.type == "Extended color light") {
                            const hsv = HueAPI.rgbToHsv({ r: red, g: green, b: blue });
                            const hsvScale = {
                                hue: Math.floor(hsv.h * 65535),
                                sat: Math.floor(hsv.s * 254),
                                bri: Math.floor(hsv.v * 254)
                            }
                            console.log({ r: red, g: green, b: blue });
                            console.log(hsvScale);
                            if (hsvScale.hue > 65535 || hsvScale.hue < 0 || hsvScale.sat > 254 || hsvScale.sat < 1 || hsvScale.bri > 254 || hsvScale.bri < 1) {
                                console.error("Wrong hsv data");
                            }
                            this.httpsRequest("PUT", "/lights/" + light_id + "/state", hsvScale).then((data) => {
                                if (data.length == 3 && data[0].success && data[1].success && data[2].success) {
                                    light.state.hue = hsvScale.hue;
                                    light.state.sat = hsvScale.sat;
                                    light.state.bri = hsvScale.bri;
                                    light.state.r = red;
                                    light.state.g = green;
                                    light.state.b = blue;
                                    resolve("#" + red.toString(16) + green.toString(16) + blue.toString(16));
                                } else {
                                    console.log(data);
                                    fail("Light has not switched to correct color");
                                }
                            }).catch(fail);
                        } else {
                            resolve("#ffffff");
                        }
                    }).catch(fail);
                }
            }
        });
    }

    switchLightState(light_id, state) {
        return new Promise((resolve, fail) => {
            if (this.knownLights[light_id] && this.knownLights[light_id].state.on != state) {
                this.httpsRequest("PUT", "/lights/" + light_id + "/state", { on: state }).then((data) => {
                    if (data[0] && data[0].success && data[0].success["/lights/" + light_id + "/state/on"] == state) {
                        this.knownLights[light_id].state.on = state;
                        resolve(state);
                    } else {
                        fail("Light has not switched to correct state");
                    }
                }).catch(fail);
            } else {
                resolve(state);
            }
        });
    }

    getRequest(url) {
        return new Promise((resolve, fail) => {
            const options = {
                ...this.options,
                path: "/api/" + this.key + url
            }
            https.get(options, res => {
                var recvData;
                res.on('data', (d) => {
                    if (!recvData) {
                        recvData = d;
                    } else {
                        recvData = Buffer.concat([recvData, d]);
                    }
                });
                res.on('end', () => {
                    resolve(JSON.parse(recvData.toString()))
                });
            }).on('error', (e) => {
                fail(e);
            });
        });
    }

    httpsRequest(method, url, bodyObject) {
        return new Promise((resolve, fail) => {
            const body = JSON.stringify(bodyObject);
            const options = {
                ...this.options,
                path: "/api/" + this.key + url,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            }
            const req = https.request(options, res => {
                var recvData;
                res.on('data', (d) => {
                    if (!recvData) {
                        recvData = d;
                    } else {
                        recvData = Buffer.concat([recvData, d]);
                    }
                });
                res.on('end', () => {
                    resolve(JSON.parse(recvData.toString()))
                });
            });
            req.on('error', (e) => {
                fail(e);
            });
            req.write(body)
            req.end();
        });
    }

    static getApiKey(ip) {
        return new Promise((resolve, fail) => {
            console.log("Please press the Button on the Hue bridge within the next 30 seconds");
            const body = JSON.stringify({
                "devicetype": "discordHueBridge#nodejs"
            });
            const options = {
                host: ip,
                path: "/api",
                method: "POST",
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };
            var requests = 0;
            var wasResolved = false;
            const requestKey = () => {
                var req = https.request(options, res => {
                    var recvData;
                    res.on('data', (d) => {
                        if (!recvData) {
                            recvData = d;
                        } else {
                            recvData = Buffer.concat([recvData, d]);
                        }
                    });
                    res.on('end', () => {
                        const object = JSON.parse(recvData.toString());
                        console.log(object);
                        if (object instanceof Array) {
                            if (object.length > 0) {
                                if (object[0]["success"]) {
                                    resolve(object[0]["success"]["username"]);
                                    wasResolved = true;
                                }
                            }
                        }
                    });
                });
                req.on('error', (e) => {
                    fail(e);
                });
                req.write(body)
                req.end();
                requests++;
                if (!wasResolved && requests < 30) {
                    setTimeout(requestKey, 1000);
                } else if (!wasResolved) {
                    fail("The button on the bridge wasn't pressed within 30 seconds");
                }
            }
            requestKey();
        });
    }

    static rgbToHsv(rgb) {
        var hsv = { h: 0, s: 0, v: 0 };
        var minRGB, maxRGB;
        if (rgb.r < rgb.g) {
            minRGB = rgb.r;
            maxRGB = rgb.g;
        } else {
            minRGB = rgb.g;
            maxRGB = rgb.r;
        }
        if (rgb.b < minRGB) {
            minRGB = rgb.b;
        }
        if (rgb.b > maxRGB) {
            maxRGB = rgb.b;
        }

        hsv.v = maxRGB;
        var constrast = maxRGB - minRGB;
        if (constrast < 0.00001) {
            hsv.s = 0;
            hsv.h = 0;
            return hsv;
        }
        if (maxRGB > 0.0) {
            hsv.s = (constrast / maxRGB);
        } else {
            hsv.s = 0;
            hsv.h = 0;
            return hsv;
        }
        if (rgb.r >= maxRGB) {
            hsv.h = (rgb.g - rgb.b) / constrast;
        } else {
            if (rgb.g >= maxRGB) {
                hsv.h = 2.0 + (rgb.b - rgb.r) / constrast;
            } else {
                hsv.h = 4.0 + (rgb.r - rgb.g) / constrast;
            }
        }

        hsv.h /= 6;

        if (hsv.h < 0.0) {
            hsv.h += 1.0;
        }

        return hsv;
    }
}

module.exports = HueAPI;
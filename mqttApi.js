const mqtt = require('mqtt')

class MqttApi {
    constructor(bridge_ip, api_key) {
        this.topic = api_key;
        this.client = mqtt.connect(bridge_ip);
    }
    setColorLight(lamp, r, g, b) {
        var cs="#"+Math.floor(r*255).toString(16).padStart(2,"0")+Math.floor(g*255).toString(16).padStart(2,"0")+Math.floor(b*255).toString(16).padStart(2,"0");
        console.log(cs);
        this.client.publish(this.topic, cs);
    }
    loadAllLights() {
        let self = this;
        return {
           then: function() {
               return {
                   then: function(cb) {
                       self.client.on('connect',cb);
                   }
               }
           }
        }
    }
}

module.exports = MqttApi


const mqtt = require('mqtt')

class MqttApi {
    constructor(bridge_ip, api_key) {
        this.client = mqtt.connect('mqtt://noradiator:1883');
    }
    setColorLight(lamp, r, g, b) {
        var cs="#"+Math.floor(r*255).toString(16).padStart(2,"0")+Math.floor(g*255).toString(16).padStart(2,"0")+Math.floor(b*255).toString(16).padStart(2,"0");
        console.log(cs);
        this.client.publish('/panzerglas/2/COLOR', cs);
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


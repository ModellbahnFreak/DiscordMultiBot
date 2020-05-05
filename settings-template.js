var data = {
    client_id: "[clientIdOfYourBotToBeFoundInTheDeveloperPortal]",
    response_uri: "https://localhost:8000/", //Must be added as response uri to yout bot
    auth_token: undefined, //To be filled out with the server token which is generated on adding the bot to your server
    bot_token: "[TokenOfYourBotToBeFoundInTheDeveloperPortal]",
    hue_bridge_ip: "[IPOfYourPhilipsHueBridge]",
    hue_bridge_key: undefined, //To be filled out after generating the Hue key on the second start of the bot
    lamp_colors: [
        { r: 1, g: 0, b: 0 },
        { r: 0, g: 1, b: 0 },
        { r: 0, g: 0, b: 1 },
    ],
    start_command: "/start",
    join_command: "/join",
}

module.exports = data;

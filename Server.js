/**
 * Made by Deftware
 */

// Imports
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const shasum = crypto.createHash('sha1');
const rl = require('readline');
const fs = require('fs');
const nconf = require('nconf');
const _ = require('lodash');
let lastTipID = 0;

/**
 * Constants
 */

const serverName = "IRCd v8, built by Deftware";
const serverHost = "127.0.0.1";
const serverStartupTime = (new Date()).toString();

/**
* Blacklists
*/
let blacklisted_nicks = "";
let blacklisted_names = "";
let blacklisted_ips = "";

// Maps

const channels = {};
const ipToRandom = {};
const randomToIp = {};
const connections = {};

// Load config
nconf.file({ file: './config.json' });

/**
 * IRC Commands 
 */

// Join cmds
const S001 = ":%SERVER_HOST% 001 %NICK% :Welcome to the network";
const S002 = ":%SERVER_HOST% 002 %NICK% :Your host is %SERVER_HOST%, running %SERVER_VERSION%";
const S003 = ":%SERVER_HOST% 003 %NICK% :This server was started at %DATE%";
const S004 = ":%SERVER_HOST% 004 %NICK% :Join a channel with /join <channel>";

const NOTICE = "NOTICE *** %MESSAGE%";

const JOIN = ":%NICK%!%USERNAME%@%HOST% JOIN %CHANNEL%";

const NAMES_BEGIN = ":%SERVER_HOST% 353 %NICK% = %CHANNEL% :";
const NAMES_END = ":%SERVER_HOST% 366 %NICK% %CHANNEL% :End of /NAMES list.";

const PART = ":%NICK%!%USERNAME%@%HOST% PART %CHANNEL% %REASON%";

const PRIVMSG = ":%NICK%!%USERNAME%@%HOST% PRIVMSG %TO% :%MESSAGE%";

const PING = ":%SERVER_HOST% PING %NUMBER%";
const PONG = ":%SERVER_HOST% PONG %SERVER_HOST% %NUMBER%";

const WHOIS = ":%SERVER_HOST% 311 %TO% %NICK% %USERNAME% %HOST% * :%REALNAME%";

const NOSUCHCHANNEL = ":%SERVER_HOST% 403 %NICK% %CHANNEL% :No such channel";

const TOPIC = ":%SERVER_HOST% 332 %NICK% %CHANNEL% :%TOPIC%";
const SETTOPIC = ":%NICK%!%USERNAME%@%HOST% TOPIC %CHANNEL% :%TOPIC%";

class Channel {

    constructor(name) {
        this.ops = [];
        // hostnames
        this.bans = [];
        this.clients = {};
        this.name = name;
        this.topic = "Default topic";
        if (getVar(name + "c_ops") !== undefined) {
            this.ops = getVar(name + "c_ops");
        }
        if (getVar(name + "c_bans") !== undefined) {
            this.bans = getVar(name + "c_bans");
        }
        if (getVar(name + "c_topic") !== undefined) {
            this.topic = getVar(name + "c_topic");
        }
    }

    setTopic(topic) {
        this.topic = topic;
        setVar(this.name + "c_topic", this.topic);
    }

    isBanned(host) {
        return this.bans.indexOf(host) > -1;
    }

    addBan(host) {
        // Make sure the nick isin't already op
        if (!this.isBanned(host)) {
            this.bans.push(host);
            setVar(this.name + "c_bans", this.bans);         
        }
    }

    removeBan(host) {
        // Make sure the nick is op
        if (this.isBanned(host)) {
            this.bans.remove(host);
            setVar(this.name + "c_bans", this.bans);            
        }
    }

    isOp(nick) {
        return this.ops.indexOf(nick) > -1;
    }

    addOp(nick) {
        // Make sure the nick isin't already op
        if (!this.isOp(nick)) {
            this.ops.push(nick);
            setVar(this.name + "c_ops", this.ops);         
        }
    }

    removeOp(nick) {
        // Make sure the nick is op
        if (this.isOp(nick)) {
            this.ops.remove(nick);
            setVar(this.name + "c_ops", this.ops);            
        }
    }

}

class Connection {

    /**
     * Client socket
     * @param {Socket} socket 
     */
    constructor(socket) {
        this.socket = socket;
        this.write(parseCommand(NOTICE, "Waiting for ident..."));
        // Setup client values
        this.nick = "";
        this.username = "";
        this.realname = "";
        this.host = socket.remoteAddress;
        this.ready = false;
        this.registered = false;
		this.lastmsg = new Date();
        this.hiddenNick = "";
        this.ping = 0;
		this.banned = false;
		this.shadowban = false;
        // Setup methods that need this
        this.welcome.bind(this);
        this.disconnect.bind(this);
        // Setup listeners
        rl.createInterface(socket, socket).on('line', this.onData.bind(this));
        socket.on('finish', this.onFinish.bind(this));
        socket.on('error', this.onFinish.bind(this));
        if (isBlacklisted(this.host, blacklisted_ips)) {
			this.disconnect("Blacklisted ip");
		}    
    }

    /**
     * Called when we recieve data from the client
     * @param {String} data
     */
    onData(data) {
        data = data.trim();
        const command = data.split(" ")[0].substring(0, 1).toUpperCase() + data.split(" ")[0].toLowerCase().substring(1);
        let handler = this[`on${command}`];
        if (!handler) {
            return this.write(parseCommand(NOTICE, "Command not supported"));
        }
        if (!this.ready && command !== "Nick" && command !== "User" && command !== "Auth" && command !== "Cap") {
            return this.write(parseCommand(NOTICE, "Please identify"));
        } 
        handler = handler.bind(this);
        try {
            handler(data.split(" "), data);
        } catch (exception) {
            log(exception);
        }
    }

    /**
     * Called when the client socket closes
     */
    onFinish() {
        // Remove the user from all maps
        delete ipToRandom[this.host];
        delete connections[this.nick];
        delete randomToIp[this.hiddenHost];
        // Remove user from all channels
        for (let name in channels) {
            if (channels[name].clients[this.nick]) {
                this.doLeave.call(this, channels[name].name, "Connection closed");
            }
        }
    }

    /**
     * Registers a nick
     * @param {*} data 
     */
    onRegister(data) {
        let passHash = hashString(data[1]);
        setVar(this.nick + "_hash", passHash);
        this.write(parseCommand(NOTICE, `You have now registered ${this.nick}, please note: we will not recover passwords, do not forget it.`));
    }
    

    /**
     * Called when the user leaves a channel
     */
    doLeave(channel, reason) {
        if (channels[channel]) {
            channel = channels[channel];
        } else {
            return;
        }
        // Remove user from channel
        if (channel.clients[this.nick]) {
            delete channel.clients[this.nick];
        }
        for (let nick in channel.clients) {
            let user = channel.clients[nick];
            let op = channel.isOp.call(channel, nick);
            user.write(parseCommand(PART, op ? this.nick : this.hiddenNick, 
            op ? this.username : this.hiddenNick, this.hiddenHost, channel.name, reason));
        }
        // Notify ourself we left
        this.write(parseCommand(PART, this.nick, 
            this.username, this.host, channel.name, reason));
    }

    onPart(data) {
        this.doLeave.call(this, data[1], arguments[1].split(":")[1]);
    }

    onKick(data) {
        let channel = data[1];
        let target = data[2];
        if (channels[channel]) {
            let chan = channels[channel];
            if (chan.isOp.call(chan, this.nick)) {
                // Make sure kicker is op
                if (chan.clients[target]) {
                    let user = chan.clients[target];
                    user.doLeave.call(user, channel, "Kicked");
                }
            }
        }
    }
	
    onNames(data) {
        const channel = channels[data[1]];
        const amIOp = channel.isOp.call(channel, this.nick);
        const oppedName = (user, nick) => (channel.isOp.call(channel, nick) ? "@" : user.shadowban ? "+" : "") + (!amIOp ? user.hiddenNick : nick);
        _.chunk(_.values(_.map(channel.clients, oppedName)), 150).forEach(chunk => {
            this.write(parseCommand(NAMES_BEGIN, serverHost, this.nick, data[1]) + chunk.join(" "));
        });
    }

    onJoin(data) {
        let channelName = data[1];
        // Make sure the channel exists
        const channel = channels[channelName] = channels[channelName] || new Channel(channelName);
        // Make sure the user does not exist already
        if (channel.clients[this.nick]) {
            return this.write(parseCommand(NOTICE, `You have already joined ${channelname}`));
        }
        // Make sure we're not banned ;(
        if (channel.isBanned.call(channel, this.host)) {
            log(this.nick + " is banned from " + channelName);
            return this.write(parseCommand(NOSUCHCHANNEL, serverHost, this.nick, channelName));
        }
        // Notify all users in the channel we have joined
        for (let nick in channel.clients) {
            let user = channel.clients[nick];
            // OP
            let prefix = this.shadowban ? "+" : "";
            if (channel.isOp.call(channel, this.nick)) {
                prefix = "@";
            }
            user.write(parseCommand(JOIN, channel.isOp.call(channel, user.nick) ? prefix + this.nick : prefix + this.hiddenNick,
            channel.isOp.call(channel, user.nick) ? this.nick : this.hiddenNick, this.hiddenHost, channelName));
        }
        // Add user to channel
        if (isEmpty(channel.clients) && channel.ops.length === 0) {
            channel.addOp.call(channel, this.nick);
        }
        channel.clients[this.nick] = this;
        // Notify user they have joined the channel
        this.write(parseCommand(JOIN, this.nick, this.username, this.host, channelName));
        // Send names
        this.onNames.call(this, data);
        // Send topic
        this.onTopic.call(this, data, arguments[1]);
    }

    write(data) {
        if (this.socket.writable) {
            this.socket.write(data + "\r\n");
        }
    }

    /**
     * Disconnects the client
     */
    disconnect(reason) {
		log("Disconnecting client " + this.nick + ", reason: " + reason);
        this.socket.destroy();
    }

    welcome() {
        this.write(parseCommand(S001, serverHost, this.nick));
        this.write(parseCommand(S002, serverHost, this.nick, serverHost, serverName));
        this.write(parseCommand(S003, serverHost, this.nick, serverStartupTime));
        this.write(parseCommand(S004, serverHost, this.nick));
    }

    /**
     * Commands handlers
     */

    onTopic(data) {
         if (arguments[1].includes(" :")) {
             // Set topic
             if (channels[data[1]]) {
                 let channel = channels[data[1]];
                 // Make sure we're op
                 if (channel.isOp.call(channel, this.nick)) {
                    channel.setTopic.call(channel, arguments[1].split(":")[1]);
                    // Inform in the current channel of topic change
                    for (let nick in channel.clients) {
                        let user = channel.clients[nick];
                        user.write(parseCommand(SETTOPIC, this.nick, this.username, this.hiddenHost, channel.name, arguments[1].split(":")[1]));
                    }
                 }
             }
         } else {
            // Get topic
            if (channels[data[1]]) {
                let channel = channels[data[1]];
                this.write(parseCommand(TOPIC, serverHost, this.nick, channel.name, channel.topic));       
            }
        }
     }

     onMode(data) {
         let channel = data[1];
         let mode = data[2];
         let target = data[3];
         if (target === "" && data[4] !== undefined) {
             target = data[4];
         }
         if (channel === undefined || mode === undefined || target === undefined) {
             return;
         }
         log({sender: this.nick, channel, mode, target});
         if (channels[channel]) {
             let chan = channels[channel];
             // Make sure we're op
             if (chan.isOp.call(chan, this.nick)) {
                if (mode.endsWith("b")) {
                    // Ban change
                    let host = target;
                    if (host.includes("@")) {
                        host = host.split("@")[1];
                        if (host !== "*!*" && randomToIp[host]) {
                            host = randomToIp[host];
                        } else {
                            host = "";
                        }
                    } else {
                        // Username ?
                        if (connections[target]) {
                            host = connections[target].host;
                        } else {
                            host = "";
                        }
                    }
                    if (host !== "") {
                        if (mode.startsWith("+")) {
                            // Set ban
                            if (!chan.isBanned.call(chan, host)) {
                                chan.addBan.call(chan, host);
                            }
                        } else if (mode.startsWith("-")) {
                            // Remove ban
                            if (chan.isBanned.call(chan, host)) {
                                chan.removeBan.call(chan, host);
                            }
                        }   
                    }
                } else if (mode.endsWith("o")) {
                    // Operator status
                    if (mode.startsWith("+")) {
                        if (!chan.isOp.call(chan, target)) {
                            chan.addOp.call(chan, target);
                        }
                    } else {
                        if (chan.isOp.call(chan, target)) {
                            chan.removeOp.call(chan, target);
                        }
                    }
                }
             }
         }
    }

     onWhois(data) {
         let nick = data[1];
         if (connections[nick]) {
            let user = connections[nick];
            this.write(parseCommand(WHOIS, serverHost, this.nick, user.nick, user.username, user.hiddenHost, user.realname));
         }
     }

     onPrivmsg(data) {
		let spam = false;
        let blacklisted = false;
		if (new Date() - this.lastmsg < 2000) {
            spam = true;
		} else {
            this.lastmsg = new Date();
        }
        data = arguments[1];
        let to = data.split(" ")[1];
        let message = data.split(to + " :")[1];
		if (isBlacklisted(message, blacklisted_names)) {
			blacklisted = true;
		}
		if (this.shadowban) {
			spam = true;
		}
        log({nick: this.nick, host: this.host, data, to, message, spam, blacklisted, shadowban: this.shadowban});
		if (!spam && !blacklisted) {
			if (to.startsWith("#")) {
				// Channel message
				if (channels[to]) {
					// Make sure the sender is in the channel
					if (channels[to].clients[this.nick]) {
						for (let user in channels[to].clients) {
							// Let's not send to ourselfs
							user = channels[to].clients[user];
							if (user.nick !== this.nick) {
								user.write(parseCommand(PRIVMSG, this.nick, this.username, this.hiddenHost, to, message));
							}
						}
					}
				}
			} else {
				if (connections[to]) {
					connections[to].write(parseCommand(PRIVMSG, this.nick, this.username, this.hiddenHost, to, message));
				}
			}
		}
     }

     onCap(data) {
         // TODO: IRCv3.1 Client Capability Negotiation
     }

     onNick(data) {
        if (this.nick !== "") {
            return this.write(parseCommand(NOTICE, "You cannot change nick"));
        }
        this.nick = data[1];
        this.hiddenNick = hashString(this.nick).substring(0, this.nick.length);
		// Is this nick blacklisted ?
        if (isBlacklisted(this.nick, blacklisted_nicks) || isBlacklisted(this.nick, blacklisted_names)) {
			this.disconnect("Blacklisted nick");
		}
        // Make sure the nick is a max of 32 chars, and a minimum of 5
        if (this.nick.length < 3 || this.nick.length > 32) {
            this.disconnect("Invalid nick length");
        }
        // Make sure the nick is not in use
        if (nickInUse(this.nick)) {
            this.write(parseCommand(NOTICE, "Your nick is in use, please use another one"));
            this.disconnect("Nick in use");
        } else {
            connections[this.nick] = this;
            this.hiddenHost = obfuscateAddress(this.host, this.nick);
        }
     }

     onAuth(data) {
         if (getVar(this.nick + "_hash") === hashString(data[1])) {
            log("User " + this.nick + " logged in");
            this.ready = true;
            this.write(parseCommand(NOTICE, `You are now identified as ${this.nick}`));
            this.welcome();
         } else {
            log("Failed login attempt on " + this.nick + " from " + this.host);
            this.write(parseCommand(NOTICE, "Invalid password"));
         }
     }

     onPong(data) {
        this.ping = 0;
     }

     onPing(data) {
        this.write(parseCommand(PONG, serverHost, serverHost, data[1]));
     }

     onUser(data) {
        if (this.username !== "") {
            return this.write(parseCommand(NOTICE, "You cannot change username/realname"));
        }
        this.username = data[1];
        this.realname = arguments[1].split(":")[1];
        if (this.nick !== "") {
            // Check if this is a registered nick
            if (getVar(this.nick + "_hash") !== undefined) {
                this.registered = true;
                this.write(parseCommand(NOTICE, `Your nick is registered, please type /auth <password>`));
            } else {
                this.ready = true;
                this.write(parseCommand(NOTICE, `You are now identified as ${this.nick}`));
                this.welcome();
            }
        }
     }

}

setInterval(() => {
    // Ping check
    for (let nick in connections) {
        let user = connections[nick];
        let ping = user.ping;
        if (ping > 300) {
            user.disconnect.call(user, "Timeout");
        } else if (ping > 120) {
            user.write.call(user, parseCommand(PING, serverHost, "387854684"));
        }
    }
}, 1000);

/**
 * Checks if a nick is already in use
 * @param {Connection} connection 
 */
function nickInUse(connection) {
    if (connections[connection.nick]) {
        return true;
    }
    return false;
}

/**
 * Parses a IRC command
 */
function parseCommand() {
    let cmd = arguments[0];
    for (let i = 1; i < arguments.length; i++) {
        let varName = "%" + cmd.split("%")[1].split("%")[0] + "%";
        cmd = cmd.replace(varName, arguments[i]);
    }
    return cmd;
}

/**
 * Saves a config setting to the config file
 * @param {*} key 
 * @param {*} value 
 */
function setVar(key, value) {
    nconf.set(key, value);
    nconf.save();
}

/**
 * Returns a setting from the config
 * @param {*} key 
 */
function getVar(key) {
    return nconf.get(key);
}

/**
 * Hashes a string with SHA-1
 * @param {String} string 
 */
function hashString(string) {
    return crypto.createHash('sha1').update(string).digest('hex');
}

/**
 * Creates a hidden host mask
 * @param {*} remoteAddress 
 */
function obfuscateAddress(remoteAddress, nick) {
  let ranval = hashString(Math.random().toString()).substring(0, 24);
  if (randomToIp[ranval]) {
    // IP is already used, generate new
    do {
      ranval = hashString(Math.random().toString()).substring(0, 24);
    } while (randomToIp[ranval])
  }
  ranval += ".hidden.host";
  if (getVar(nick + "_host") !== undefined) {
      ranval = getVar(nick + "_host");
  }
  randomToIp[ranval] = remoteAddress;
  ipToRandom[remoteAddress] = ranval;
  return ranval;
}

/**
 * Is a map empty ?
 * @param {Map} map 
 */
function isEmpty(map) {
   for (var i in map) return false;
   return true;
}

/**
 * Logs to console
 * @param {*} data 
 */
function log(data) {
    let date = new Date();
    date = "[" + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "]";
    console.log(date, data);
    if (!fs.existsSync("./logs/")){
        fs.mkdirSync("./logs/");
    }
    fs.appendFileSync("./logs/" + getCurrentDate() + ".log", date + " " + objToString(data) + "\n");
}

function objToString(data) {
    let log = "{ ";
    for (let key in data) {
        if (isInt(key)) {
            return data;
        }
        log += key + ": " + (isInt(data[key]) ? data[key] : "'" + data[key] + "'") + ", ";
    }
    log = log.substring(0, log.length - 2);
    log += " }";
    return log;
}

function isInt(value) {
  return !isNaN(value) && 
         parseInt(Number(value)) == value && 
         !isNaN(parseInt(value, 10));
}

function getCurrentDate() {
    const dateobj= new Date() ;
    const month = dateobj.getMonth() + 1;
    const day = dateobj.getDate();
    const year = dateobj.getFullYear();
    return year + "-" + month + "-" + day;
}

function isBlacklisted(string, map) {
	string = string.toLowerCase();
	if (string.indexOf(' ') >= 0) {
		for (let s of string.split(" ")) {
			if (map.indexOf(s) > -1) {
				return true;
			}
		}
	} else {
        if (map.indexOf(string) > -1) {
			return true;
		}
	}
	return false;
}

function reloadBlacklists() {
	blacklisted_names = fs.readFileSync("./blacklisted_words.txt").toString().toLowerCase().split("\r\n");
	blacklisted_ips = fs.readFileSync("./blacklisted_ips.txt").toString().toLowerCase().split("\r\n");
	blacklisted_nicks = fs.readFileSync("./blacklisted_nicks.txt").toString().toLowerCase().split("\r\n");
}

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

reloadBlacklists();

setVar("server", serverName);

const handleConnect = socket => new Connection(socket);
const netServer = net.createServer(handleConnect);
let ssl = false;

if (fs.existsSync("./ssl/cert.pem")) {
    log("SSL certificates found, setting up SSL server...");
    // SSL Certs
    const options = {
        key: fs.readFileSync('./ssl/rsa.key'),
        cert: fs.readFileSync('./ssl/cert.pem'),
    };
    const tlsServer = tls.createServer(options, handleConnect);
    tlsServer.listen(6697);
    ssl = true;
} else {
    log("[Warning] No SSL certificates found, server will be running unencrypted");
}

netServer.listen(6667);

log("Listening for connections on port 6667" + (ssl ? " & 6697 [SSL]" : ""));

module.exports = {setVar, getVar, log, hashString};

NJSIRCD
===================
The Node.js IRC Daemon (NJSIRCD) is a privacy focused high throughput IRC daemon.

Installing
-------------------

Clone this git, run `npm install` and make three files, `blacklisted_ips.txt`, `blacklisted_nicks.txt` and `blacklisted_words.txt`. Edit them to your liking, if you
wish to use SSL simply make a new folder called `SSL`, in it drop your cert file `cert.pem` and key `rsa.key`. 

Running
-------------------

To run this IRC simply run
`node App` or `npm start`

Server commands
-------------------

This server has the essentials built in for claiming nicks, banning, etc.

* /register <Password> - This will register your current nick.
* /auth <Password> - Used to access your claimed nick when you join the IRC.
* /mode <Options> - Used to ban and give op to people.
* /kick <Nick> - Kicks a user from a channel.
* /part <Reason> - Leave a IRC channel.
* /topic <Options> - Sets/Gets the channel topic.
* /join <Channel> - Joins a channel, if it doesn't exist, you get channel operator status.
* /ping - Pings the server
* /names - Returns a list of all nicks in a channel
* /whois <Nick> - Returns info about a given user (nick, realname, hostname)

This server also supports things like private messages.

The privacy part
-------------------

This IRC will hide everyone's IP address and their username. Only channel ops can see the real username's, and no one can see the real ips.
Things like registering nicks is built in in the IRC server, to register a nick simply run `/register <password>` to claim your current nick.

Connections
-------------------

This server can easily handle thousands of concurrent users.

License
-------------------

NJSIRCD is licensed under GPL-3.0

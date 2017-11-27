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

The privacy part
-------------------

This IRC will hide everyones IP address and their username. Only channels ops can see the real usernames, and no one can see the real ips.

Connections
-------------------

This server can easily handle thousands of concurrent users.

License
-------------------

NJSIRCD is licensed under GPL-3.0

NJSIRCD
===================
The Node.js IRC Daemon (NJSIRCD) is a privacy focused high throughput IRC daemon.

Installing
-------------------

Clone this git, make three files, `blacklisted_ips.txt`, `blacklisted_nicks.txt` and `blacklisted_words.txt`. Edit them to your liking, of you
wish to use SSL simply make a new folder called `SSL`, in it drop your cert file `cert.pem` and key `rsa.key`. To run this IRC simply run
`node App` or `npm start`

License
-------------------

NJSIRCD is licensed under GPL-3.0

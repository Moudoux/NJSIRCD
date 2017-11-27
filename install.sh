#!/bin/bash

echo "Installing NJSIRCD..."

# Clone git
git clone https://github.com/Moudoux/NJSIRCD.git
cd NJSIRCD

# Install Node modules
echo "Installing dependencies..."
npm install

# Make files
echo "Setting up files..."
echo "" > blacklisted_ips.txt
echo "" > blacklisted_nicks.txt
echo "" > blacklisted_words.txt

# Done
echo "Done, if you want to use SSL drop your cert and key in the SSL folder."
echo "To start the server run \"node App\" or \"npm start\""

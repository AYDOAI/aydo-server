# Base image
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN apt-get update && apt-get install -y libavahi-compat-libdnssd-dev udev

# Install app dependencies
RUN npm install

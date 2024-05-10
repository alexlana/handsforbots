FROM node:18.17.1

WORKDIR /usr/src/app

COPY vite/package.json /usr/src/app
COPY vite/vite.config.js /usr/src/app

RUN apt-get update && apt-get install xdg-utils -y
RUN npm install -g npm@10.4.0
RUN npm install

CMD ["npm", "run", "dev"]

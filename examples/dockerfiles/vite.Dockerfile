FROM node:lts

WORKDIR /usr/src/app

COPY vite/package.json vite/package-lock.json /usr/src/app/
COPY vite/vite.config.js /usr/src/app/

RUN apt-get update && apt-get install xdg-utils -y
RUN npm install -g npm@10.4.0
RUN npm ci

CMD ["npm", "run", "dev"]

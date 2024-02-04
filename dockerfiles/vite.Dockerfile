FROM node:18.17.1

WORKDIR /usr/src/app

RUN apt-get update && apt-get install xdg-utils -y
RUN npm install -g npm@10.2.1

EXPOSE 5173

CMD ["npm", "run", "dev"]

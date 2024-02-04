FROM python:3.9.18-slim

RUN apt-get update && \
	apt-get install -y python3-venv python3-pip

# Atualiza o pip
RUN python3 -m pip install --upgrade pip

# Instala a versão mais recente do Rasa SDK
RUN pip install rasa && \
	pip install rasa-sdk

WORKDIR /app

COPY ./rasa /app

USER root

RUN pip install -r /app/actions/requirements.txt

USER 1001

WORKDIR /app/actions

# the entry point
EXPOSE 5055
ENTRYPOINT [ "rasa", "run", "actions", "-p", "5055" ]

FROM python:3.9.18-slim

RUN apt-get update && \
	apt-get install -y python3-venv python3-pip

# Atualiza o pip
RUN python3 -m pip install --upgrade pip

# Instala a versão mais recente do Rasa SDK
RUN pip install rasa==3.6.16 && \
	pip install rasa-sdk==3.7.1

WORKDIR /app

COPY ./rasa /app

RUN chmod 777 /app

USER root

RUN pip install -r /app/actions/requirements-actions.txt

USER 1001

WORKDIR /app

# the entry point
ENTRYPOINT [ "rasa", "run", "actions", "-p", "5055" ]

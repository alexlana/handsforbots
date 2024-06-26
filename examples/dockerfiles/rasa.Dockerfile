FROM python:3.9.18-slim

RUN apt-get update && \
	apt-get install -y python3-venv python3-pip \
	pkg-config \
	libhdf5-dev

# Cria um ambiente virtual e o ativa
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Atualiza o pip
RUN python3 -m pip install --upgrade pip

# Instala a versão mais recente do Rasa no ambiente virtual
RUN pip install --default-timeout=100 rasa==3.6.19 && \
	pip3 install --no-cache-dir spacy && \
	python -m spacy download en_core_web_md && \
	python -m spacy download pt_core_news_sm

WORKDIR /app

COPY ./rasa /app

# the entry point
EXPOSE 5005
ENTRYPOINT [ "rasa", "run", "--enable-api", "--cors", "*", "--port", "5005" ]
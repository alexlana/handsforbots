/**
 * SessionManager - Gerencia sessões locais do usuário
 * Responsável por: histórico de conversa, timeout de sessão, storage local com criptografia
 */

import WebStorage from './WebStorage.umd.min.js'
import CryptoKeys from './CryptoKeys.js'

export default class SessionManager {

	/**
	 * SessionManager constructor
	 * @param {Object} options - Configurações da sessão
	 * @param {number} options.timeout - Timeout da sessão em minutos (padrão: 30)
	 * @param {string} options.storagePrefix - Prefixo para chaves do storage (padrão: 'bot-storage/')
	 * @param {string} options.cryptoKeyName - Nome da chave de criptografia (padrão: 'cryptoKey')
	 * @param {Worker} options.cryptoWorker - Worker para criptografia
	 * @param {Object} options.bot - Instância do bot
	 */
	constructor(options = {}) {
        this.clearSessionIfExpired()

        // Configurações
		this.timeout = options.timeout || 30 // minutos
		this.storagePrefix = options.storagePrefix || 'bot-storage/'
		this.cryptoKeyName = options.cryptoKeyName || 'cryptoKey'
		this.oneMinute = 1000 * 60

		// Dependências externas
		this.cryptoWorker = options.cryptoWorker
		this.bot = options.bot

		// Estado da sessão
        // this.history = []
		this.lastInteraction = Date.now()
		this.historyLoaded = false

		// Storage local
		this.storage = null
		this.cryptoKeys = null

        this.clearSessionIfExpiredTimeout = null

		// Inicializar se não for storage backend
		if (options.storageType !== 'backend') {
			this.initializeLocalStorage()
		}

		console.log('[✔︎] SessionManager initialized.')
	}

	/**
	 * Getter para histórico - sempre acessa this.bot.history
	 * @return {Array} Histórico do bot
	 */
	get history() {
		return this.bot.history
	}

	/**
	 * Setter para histórico - sempre atualiza this.bot.history
	 * @param {Array} newHistory - Novo histórico
	 */
	set history(newHistory) {
        this.bot.history = newHistory
	}

	/**
	 * Inicializa storage local e criptografia
	 */
	initializeLocalStorage() {
		// Configurar storage local
		this.storage = WebStorage.createInstance({
			driver: 'localStorage',
			keyPrefix: this.storagePrefix
		})

		// Configurar criptografia
		if (this.cryptoWorker) {
			this.cryptoKeys = new CryptoKeys(
				this.cryptoKeyName, 
				this.storage, 
				this.timeout
			)
		}
	}

	/**
	 * Adiciona evento ao histórico da sessão
	 * @param {string} type - Tipo do evento ('input', 'output', 'feedback')
	 * @param {string|Array} plugin - Nome do plugin ou lista de plugins
	 * @param {*} payload - Dados do evento
	 * @param {string} title - Título opcional do evento
	 */
	async addToHistory(type, plugin, payload, title = null) {
		if (!type) {
			throw new Error('O parâmetro "type" (input, output, feedback) é obrigatório.')
		}
		if (!plugin) {
			throw new Error('O parâmetro "plugin" é obrigatório.')
		}
		if (!payload) {
			throw new Error('O parâmetro "payload" é obrigatório.')
		}

        // Se a chave de criptografia não estiver disponível, gerar uma nova. Temos que resolver isso antes de adicionar a mensagem ao histórico porque vamos limpar o histórico ao gerar uma nova chave.
        let key = null
        try {
            key = await this.cryptoKeys.getKey()
        } catch (error) {
            this.clearSession()
            key = await this.cryptoKeys.generateKey()
        }    

		// Criar item do histórico
		const historyItem = [type, plugin, payload, title]
		this.history.push(historyItem)

		// Renovar sessão
		this.renewSession(Date.now())

		// Salvar no storage se disponível
		if (this.storage && this.cryptoKeys) {
			await this.saveHistoryToStorage(key)
		}

        return this.history
	}

	/**
	 * Salva histórico no storage com criptografia
	 */
	async saveHistoryToStorage(key) {
		try {
			const historyJson = JSON.stringify(this.history)
            const encryptedHistory = await this.encrypt(historyJson, key)

			this.storage.setItem('history', encryptedHistory, error => {
				if (error) console.error('Erro ao salvar histórico:', error)
			})

			this.storage.setItem('time', this.lastInteraction, error => {
				if (error) console.error('Erro ao salvar timestamp:', error)
			})
		} catch (error) {
			console.error('Erro ao salvar histórico criptografado:', error)
		}
	}

	/**
	 * Reconstrói histórico do storage
	 */
	async rebuildHistory() {
		if (!this.storage) {
            console.log('sem history', this.history)
			this.history = []
			this.historyLoaded = true
			return
		}

		const currentTime = Date.now()
		const oldTime = this.storage.getItem('time', error => {
			if (error) console.error('Erro ao recuperar timestamp:', error)
		})

		this.renewSession(currentTime)

		let storedHistory = this.storage.getItem('history', error => {
			if (error) console.error('Erro ao recuperar histórico:', error)
		})

        if (storedHistory) {
			try {
				// Descriptografar histórico
				const decryptedHistory = await this.decrypt(storedHistory)
				
				// Verificar se sessão expirou
				if (this.checkSessionExpired()) {
					this.clearSession()
					this.history = []
				} else {
					this.history = JSON.parse(decryptedHistory)
				}
			} catch (error) {
				console.error('Erro ao descriptografar histórico:', error)
				this.history = []
			}
		} else if (!this.history) {
			this.history = []
		}

		this.historyLoaded = true
	}

	/**
	 * Verifica se a sessão expirou
	 */
	checkSessionExpired() {

		const currentTime = Date.now()
		const sessionExpired = this.lastInteraction < currentTime - (this.oneMinute * this.timeout)

        return sessionExpired

	}

	/**
	 * Verifica se a sessão expirou
	 */
	clearSessionIfExpired() {

		const sessionExpired = this.checkSessionExpired()
		const currentTime = Date.now()
        let divider = 1

		if (sessionExpired) {
			if (this.history.length === 0) {
				this.renewSession(currentTime)
				return
			}
			this.clearSession()
		} else {
			// Configurar próxima verificação
			const timeElapsed = currentTime - this.lastInteraction
			const sessionDuration = this.oneMinute * this.timeout

			// Se 90% do tempo da sessão passou, verificar mais frequentemente
			if (timeElapsed > sessionDuration * 0.9) {
				divider = 1000
			}
		}

        clearTimeout(this.clearSessionIfExpiredTimeout)
        this.clearSessionIfExpiredTimeout = setTimeout(() => {
            this.clearSessionIfExpired()
        }, this.oneMinute / divider)
	}

	/**
	 * Renova o tempo da sessão
	 * @param {number} time - Timestamp em milissegundos
	 */
	renewSession(time = null) {
		this.lastInteraction = time || Date.now()
	}

	/**
	 * Limpa a sessão e storage
	 */
	clearSession() {
		if (this.cryptoKeys) {
			this.cryptoKeys.destroyKey()
		}

		if (this.storage) {
			this.storage.removeItem('history')
		}

		this.history = []
	}

	/**
	 * Criptografa dados
	 * @param {string} data - Dados para criptografar
	 * @return {Promise<string>} Dados criptografados
	 */
	async encrypt(data, key) {
		if (!this.cryptoWorker || !this.cryptoKeys) {
			return data // Retorna sem criptografia se não disponível
		}

		return new Promise((resolve, reject) => {
			this.cryptoWorker.postMessage({
				data: data,
				action: 'encrypt',
				key: key
			})

			this.cryptoWorker.onmessage = (event) => {
				if (event.data.error) {
					reject(event.data.error)
				} else {
					resolve(event.data.result)
				}
			}
		})
	}

	/**
	 * Descriptografa dados
	 * @param {string} encryptedData - Dados criptografados
	 * @return {Promise<string>} Dados descriptografados
	 */
	async decrypt(encryptedData) {
		if (!this.cryptoWorker || !this.cryptoKeys) {
			return encryptedData // Retorna sem descriptografia se não disponível
		}

		let key = null
		try {
			key = await this.cryptoKeys.getKey()
		} catch (error) {
			this.clearSession()
			key = await this.cryptoKeys.generateKey()
		}

		return new Promise((resolve, reject) => {
			this.cryptoWorker.postMessage({
				data: encryptedData,
				action: 'decrypt',
				key: key
			})

			this.cryptoWorker.onmessage = (event) => {
				if (event.data.error) {
					reject(event.data.error)
				} else {
					resolve(event.data.result)
				}
			}
		})
	}

	/**
	 * Obtém o histórico da sessão
	 * @return {Array} Histórico da sessão
	 */
	getHistory() {
		return this.history
	}

	/**
	 * Verifica se o histórico foi carregado
	 * @return {boolean} True se carregado
	 */
	isHistoryLoaded() {
		return this.historyLoaded
	}

	/**
	 * Obtém informações da sessão
	 * @return {Object} Informações da sessão
	 */
	getSessionInfo() {
		return {
			lastInteraction: this.lastInteraction,
			timeout: this.timeout,
			historyLength: this.history.length,
			historyLoaded: this.historyLoaded,
			hasStorage: !!this.storage,
			hasCrypto: !!this.cryptoKeys
		}
	}

	/**
	 * Verifica se a sessão está ativa
	 * @return {boolean} True se ativa
	 */
	isSessionActive() {
		const currentTime = Date.now()
		return this.lastInteraction >= currentTime - (this.oneMinute * this.timeout)
	}

	/**
	 * Log do status do histórico carregado
	 */
	logHistoryStatus() {
		if (this.history.length > 0) {
			console.log('[✔︎] SessionManager: Conversation history recovered.')
		} else {
			console.log('[ℹ] SessionManager: No previous conversation history found.')
		}
	}

	/**
	 * Configura timeout da sessão
	 * @param {number} timeoutMinutes - Timeout em minutos
	 */
	setTimeout(timeoutMinutes) {
		this.timeout = timeoutMinutes
		if (this.cryptoKeys) {
			this.cryptoKeys.timeout = timeoutMinutes
		}
	}

	/**
	 * Obtém estatísticas da sessão
	 * @return {Object} Estatísticas
	 */
	getStats() {
		const currentTime = Date.now()
		const sessionAge = currentTime - this.lastInteraction
		const sessionRemaining = (this.oneMinute * this.timeout) - sessionAge

		return {
			historyItems: this.history.length,
			sessionAge: Math.floor(sessionAge / this.oneMinute),
			sessionRemaining: Math.floor(sessionRemaining / this.oneMinute),
			isActive: this.isSessionActive(),
			isLoaded: this.historyLoaded
		}
	}
}
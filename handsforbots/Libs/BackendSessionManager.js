/**
 * BackendSessionManager - Gerencia sessões com APIs externas
 * Responsável por: sessionId para backends, retry logic, session renewal
 */

export default class BackendSessionManager {

	/**
	 * BackendSessionManager constructor
	 * @param {Object} options - Configurações da sessão backend
	 * @param {string} options.endpoint - URL base do backend
	 * @param {string} options.sessionEndpoint - Endpoint para obter sessionId (padrão: '/session')
	 * @param {number} options.retryAttempts - Número de tentativas de retry (padrão: 3)
	 * @param {number} options.retryDelay - Delay entre tentativas em ms (padrão: 1000)
	 * @param {Object} options.headers - Headers adicionais para requisições
	 * @param {Object} options.eventEmitter - EventEmitter para disparar eventos
	 */
	constructor(options = {}) {
		// Configurações
		this.endpoint = options.endpoint
		this.sessionEndpoint = options.sessionEndpoint || '/session'
		this.retryAttempts = options.retryAttempts || 3
		this.retryDelay = options.retryDelay || 1000
		this.headers = options.headers || {}
		this.eventEmitter = options.eventEmitter

		// Estado da sessão
		this.sessionId = null
		this.isSessionValid = false
		this.lastSessionRequest = null
		this.sessionCreatedAt = null
		this.requestCount = 0

		// Controle de retry
		this.currentRetryCount = 0

		console.log('[✔︎] BackendSessionManager initialized.')
	}

	/**
	 * Obtém sessionId do backend
	 * @return {Promise<string>} Session ID
	 */
	async fetchSessionId() {
		if (!this.endpoint) {
			throw new Error('Endpoint não configurado para BackendSessionManager')
		}

		try {
			const sessionUrl = this.endpoint + this.sessionEndpoint
			const requestOptions = {
				method: 'GET',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json; charset=UTF-8',
					...this.headers
				},
				credentials: 'omit'
			}

			this.lastSessionRequest = Date.now()

			const response = await fetch(sessionUrl, requestOptions)

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const data = await response.json()

			if (data.session_id) {
				this.sessionId = data.session_id
				this.isSessionValid = true
				this.sessionCreatedAt = Date.now()
				this.currentRetryCount = 0

				// Disparar evento de sessão criada
				if (this.eventEmitter) {
					this.eventEmitter.trigger('backend_session.created', [this.sessionId])
				}

				console.log('[✔︎] BackendSessionManager: Session ID obtido do backend:', this.sessionId)
				return this.sessionId
			} else {
				throw new Error('Resposta do backend não contém session_id')
			}
		} catch (error) {
			console.error('Erro ao obter session ID do backend:', error)
			
			// Disparar evento de erro
			if (this.eventEmitter) {
				this.eventEmitter.trigger('backend_session.error', [error])
			}

			// Fallback para session ID local
			return this.generateLocalSessionId()
		}
	}

	/**
	 * Gera session ID local como fallback
	 * @return {string} Session ID local
	 */
	generateLocalSessionId() {
		const timestamp = Date.now()
		const random = Math.random().toString(36).substr(2, 9)
		const sessionId = `session_${timestamp}_${random}`
		
		this.sessionId = sessionId
		this.isSessionValid = false // Marca como não válido pois é local
		this.sessionCreatedAt = Date.now()

		console.warn('[⚠] BackendSessionManager: Usando session ID local (fallback):', sessionId)
		
		// Disparar evento de fallback
		if (this.eventEmitter) {
			this.eventEmitter.trigger('backend_session.fallback', [sessionId])
		}

		return sessionId
	}

	/**
	 * Garante que temos um session ID válido
	 * @return {Promise<string>} Session ID
	 */
	async ensureSessionId() {
		if (!this.sessionId || !this.isSessionValid) {
			this.sessionId = await this.fetchSessionId()
		}
		return this.sessionId
	}

	/**
	 * Executa requisição com retry automático
	 * @param {Function} requestFunction - Função que executa a requisição
	 * @param {*} requestData - Dados da requisição
	 * @return {Promise<*>} Resposta da requisição
	 */
	async executeWithRetry(requestFunction, requestData) {
		this.currentRetryCount = 0

		while (this.currentRetryCount <= this.retryAttempts) {
			try {
				// Garantir session ID antes da requisição
				await this.ensureSessionId()

				// Executar requisição
				const result = await requestFunction(requestData)
				
				// Reset retry count em caso de sucesso
				this.currentRetryCount = 0
				this.requestCount++

				// Disparar evento de sucesso
				if (this.eventEmitter) {
					this.eventEmitter.trigger('backend_session.request_success', [result])
				}

				return result
			} catch (error) {
				this.currentRetryCount++
				
				console.warn(`BackendSessionManager: Tentativa ${this.currentRetryCount}/${this.retryAttempts} falhou:`, error.message)

				// Se ainda há tentativas, aguardar e tentar novamente
				if (this.currentRetryCount <= this.retryAttempts) {
					// Invalidar sessão em caso de erro de autenticação
					if (this.isAuthenticationError(error)) {
						this.invalidateSession()
					}

					// Aguardar antes da próxima tentativa
					await this.delay(this.retryDelay * this.currentRetryCount)
				} else {
					// Esgotar tentativas - disparar evento de erro final
					if (this.eventEmitter) {
						this.eventEmitter.trigger('backend_session.request_failed', [error])
					}
					
					throw error
				}
			}
		}
	}

	/**
	 * Verifica se o erro é relacionado à autenticação
	 * @param {Error} error - Erro da requisição
	 * @return {boolean} True se for erro de autenticação
	 */
	isAuthenticationError(error) {
		const authErrorCodes = [401, 403]
		const authErrorMessages = ['unauthorized', 'forbidden', 'invalid session', 'session expired']
		
		// Verificar código de status HTTP
		if (error.status && authErrorCodes.includes(error.status)) {
			return true
		}

		// Verificar mensagem de erro
		const errorMessage = error.message?.toLowerCase() || ''
		return authErrorMessages.some(msg => errorMessage.includes(msg))
	}

	/**
	 * Invalida a sessão atual
	 */
	invalidateSession() {
		console.log('[ℹ] BackendSessionManager: Invalidando sessão atual')
		
		this.sessionId = null
		this.isSessionValid = false
		this.sessionCreatedAt = null

		// Disparar evento de invalidação
		if (this.eventEmitter) {
			this.eventEmitter.trigger('backend_session.invalidated')
		}
	}

	/**
	 * Renova a sessão forçadamente
	 * @return {Promise<string>} Novo session ID
	 */
	async renewSession() {
		console.log('[ℹ] BackendSessionManager: Renovando sessão')
		
		this.invalidateSession()
		return await this.fetchSessionId()
	}

	/**
	 * Delay assíncrono
	 * @param {number} ms - Milissegundos para aguardar
	 * @return {Promise} Promise que resolve após o delay
	 */
	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	/**
	 * Gera ID único para requisições
	 * @return {string} Request ID
	 */
	generateRequestId() {
		const timestamp = Date.now()
		const random = Math.random().toString(36).substr(2, 9)
		return `req_${timestamp}_${random}`
	}

	/**
	 * Obtém headers padrão para requisições
	 * @param {Object} additionalHeaders - Headers adicionais
	 * @return {Object} Headers completos
	 */
	getRequestHeaders(additionalHeaders = {}) {
		const requestId = this.generateRequestId()
		
		return {
			'Accept': 'application/json',
			'Content-Type': 'application/json; charset=UTF-8',
			'X-Request-ID': requestId,
			'X-Session-ID': this.sessionId || '',
			...this.headers,
			...additionalHeaders
		}
	}

	/**
	 * Obtém informações da sessão backend
	 * @return {Object} Informações da sessão
	 */
	getSessionInfo() {
		const currentTime = Date.now()
		const sessionAge = this.sessionCreatedAt ? currentTime - this.sessionCreatedAt : 0

		return {
			sessionId: this.sessionId,
			isValid: this.isSessionValid,
			createdAt: this.sessionCreatedAt,
			ageInMinutes: Math.floor(sessionAge / (1000 * 60)),
			requestCount: this.requestCount,
			endpoint: this.endpoint,
			lastRequest: this.lastSessionRequest
		}
	}

	/**
	 * Verifica se a sessão está ativa
	 * @return {boolean} True se ativa
	 */
	isActive() {
		return !!(this.sessionId && this.isSessionValid)
	}

	/**
	 * Obtém estatísticas da sessão backend
	 * @return {Object} Estatísticas
	 */
	getStats() {
		const sessionInfo = this.getSessionInfo()
		
		return {
			hasSession: !!this.sessionId,
			isValid: this.isSessionValid,
			sessionAge: sessionInfo.ageInMinutes,
			totalRequests: this.requestCount,
			currentRetries: this.currentRetryCount,
			maxRetries: this.retryAttempts,
			endpoint: this.endpoint
		}
	}

	/**
	 * Configura novo endpoint
	 * @param {string} endpoint - Novo endpoint
	 */
	setEndpoint(endpoint) {
		if (endpoint !== this.endpoint) {
			this.endpoint = endpoint
			this.invalidateSession() // Invalidar sessão ao mudar endpoint
		}
	}

	/**
	 * Configura headers adicionais
	 * @param {Object} headers - Headers para adicionar/atualizar
	 */
	setHeaders(headers) {
		this.headers = { ...this.headers, ...headers }
	}

	/**
	 * Limpa todos os dados da sessão
	 */
	clear() {
		this.sessionId = null
		this.isSessionValid = false
		this.sessionCreatedAt = null
		this.lastSessionRequest = null
		this.requestCount = 0
		this.currentRetryCount = 0

		console.log('[✔︎] BackendSessionManager: Sessão limpa')

		// Disparar evento de limpeza
		if (this.eventEmitter) {
			this.eventEmitter.trigger('backend_session.cleared')
		}
	}
}
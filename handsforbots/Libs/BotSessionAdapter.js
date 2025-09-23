/**
 * BotSessionAdapter - Adapter para integrar SessionManager no Bot.js
 * Mantém compatibilidade total com a API existente do Bot.js
 */

import SessionManager from './SessionManager.js'

export default class BotSessionAdapter {

    /**
     * BotSessionAdapter constructor
     * @param {Object} bot - Instância do Bot
     * @param {Object} options - Opções de configuração
     */
    constructor(bot, options = {}) {
        this.bot = bot

        // Criar SessionManager com as configurações do Bot
        this.sessionManager = new SessionManager({
            timeout: options.session_timeout || 30,
            storagePrefix: 'bot-storage/',
            cryptoKeyName: 'cryptoKey',
            cryptoWorker: options.crypto_worker,
            storageType: options.storage_side,
            bot: bot  // Passar referência do bot
        })

        console.log('[✔︎] BotSessionAdapter initialized.')
    }

    /**
     * Reconstrói histórico com logs apropriados
     */
    async rebuildHistory() {
        await this.sessionManager.rebuildHistory()
        this.sessionManager.logHistoryStatus()
        return this.sessionManager.history
    }

    /**
     * Adiciona evento ao histórico (compatível com Bot.js)
     * @param {string} type - Tipo do evento
     * @param {string|Array} plugin - Plugin(s)
     * @param {*} payload - Dados
     * @param {string} title - Título opcional
     */
    async addToHistory(type, plugin, payload, title = null) {
        await this.sessionManager.addToHistory(type, plugin, payload, title)
    }


    /**
     * Verifica se sessão expirou (compatível com Bot.js)
     */
    checkSessionExpired() {
        return this.sessionManager.checkSessionExpired()
    }

    clearSessionIfExpired() {
        return this.sessionManager.clearSessionIfExpired()
    }

    /**
     * Renova sessão (compatível com Bot.js)
     * @param {number} time - Timestamp
     */
    renewSession(time = null) {
        return this.sessionManager.renewSession(time)
    }

    /**
     * Limpa storage (compatível com Bot.js)
     */
    clearStorage() {
        return this.sessionManager.clearSession()
    }

    /**
     * Criptografia (compatível com Bot.js)
     * @param {string} data - Dados
     * @param {string} action - Ação ('encrypt' ou 'decrypt')
     */
    async cryptography(data, action) {
        if (action === 'encrypt') {
            return await this.sessionManager.encrypt(data)
        } else if (action === 'decrypt') {
            return await this.sessionManager.decrypt(data)
        }
        throw new Error(`Ação de criptografia inválida: ${action}`)
    }

    /**
     * Obtém histórico (compatível com Bot.js)
     * @return {Array} Histórico
     */
    get history() {
        return this.sessionManager.getHistory()
    }

    /**
     * Define histórico (compatível com Bot.js)
     * @param {Array} history - Novo histórico
     */
    set history(history) {
        this.sessionManager.history = history
    }

    /**
     * Obtém status de histórico carregado (compatível com Bot.js)
     * @return {boolean} True se carregado
     */
    get history_loaded() {
        return this.sessionManager.isHistoryLoaded()
    }

    /**
     * Define status de histórico carregado (compatível com Bot.js)
     * @param {boolean} loaded - Status
     */
    set history_loaded(loaded) {
        this.sessionManager.historyLoaded = loaded
    }

    /**
     * Obtém última interação (compatível com Bot.js)
     * @return {number} Timestamp
     */
    get lastInteraction() {
        return this.sessionManager.lastInteraction
    }

    /**
     * Define última interação (compatível com Bot.js)
     * @param {number} time - Timestamp
     */
    set lastInteraction(time) {
        this.sessionManager.lastInteraction = time
    }

    /**
     * Obtém timeout da sessão (compatível com Bot.js)
     * @return {number} Timeout em minutos
     */
    get session_timeout() {
        return this.sessionManager.timeout
    }

    /**
     * Define timeout da sessão (compatível com Bot.js)
     * @param {number} timeout - Timeout em minutos
     */
    set session_timeout(timeout) {
        this.sessionManager.setTimeout(timeout)
    }

    /**
     * Obtém constante de um minuto (compatível com Bot.js)
     * @return {number} Milissegundos em um minuto
     */
    get one_minute() {
        return this.sessionManager.oneMinute
    }

    /**
     * Obtém storage (compatível com Bot.js)
     * @return {Object} Storage instance
     */
    get botStorage() {
        return this.sessionManager.storage
    }

    /**
     * Obtém crypto keys (compatível com Bot.js)
     * @return {Object} CryptoKeys instance
     */
    get crypto_keys() {
        return this.sessionManager.cryptoKeys
    }

    /**
     * Obtém informações detalhadas da sessão
     * @return {Object} Informações da sessão
     */
    getSessionInfo() {
        return this.sessionManager.getSessionInfo()
    }

    /**
     * Obtém estatísticas da sessão
     * @return {Object} Estatísticas
     */
    getStats() {
        return this.sessionManager.getStats()
    }

    /**
     * Verifica se sessão está ativa
     * @return {boolean} True se ativa
     */
    isSessionActive() {
        return this.sessionManager.isSessionActive()
    }

    /**
     * Método para migração gradual - permite acesso direto ao SessionManager
     * @return {SessionManager} Instância do SessionManager
     */
    getSessionManager() {
        return this.sessionManager
    }
}
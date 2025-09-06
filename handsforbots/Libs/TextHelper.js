/**
 * TextHelper - Biblioteca para tratamento e processamento de texto
 * 
 * Esta biblioteca centraliza funções comuns de processamento de texto
 * usadas em diferentes backends do HandsForBots.
 * 
 * @author HandsForBots Team
 * @version 1.0.0
 */

class TextHelper {
	/**
	 * Decodifica texto UTF-8 com tratamento de aspas e sequências escapadas
	 * 
	 * Esta função trata vários formatos de codificação de texto comumente
	 * encontrados em respostas de APIs de LLM:
	 * - Remove aspas desnecessárias (simples, duplas, escapadas)
	 * - Decodifica sequências Unicode (\u00e9, etc.)
	 * - Decodifica URI encoding (%20, etc.)
	 * - Inclui fallback para processamento manual
	 * 
	 * @param {any} text - Texto para decodificar (será convertido para string)
	 * @returns {string} Texto decodificado
	 */
	static decodeUTF8(text) {
		if (!text) return '';
		
		// Ensure text is a string
		if (typeof text !== 'string') {
			text = String(text);
		}
		
		// Remove unnecessary quotes at beginning and end
		let cleanText = text.trim();
		
		// Remove double quotes at beginning and end
		if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
			cleanText = cleanText.slice(1, -1);
		}
		
		// Remove single quotes at beginning and end
		if (cleanText.startsWith("'") && cleanText.endsWith("'")) {
			cleanText = cleanText.slice(1, -1);
		}
		
		// Remove escaped double quotes at beginning and end
		if (cleanText.startsWith('\\"') && cleanText.endsWith('\\"')) {
			cleanText = cleanText.slice(2, -2);
		}

		try {
			// If text contains escaped Unicode sequences (\u00e9, etc.)
			if (cleanText.includes('\\u')) {
				// Remove extra backslashes that might be causing issues
				const processedText = cleanText.replace(/\\\\/g, '\\');
				return JSON.parse('"' + processedText + '"');
			}
			
			// If text is in URI encoded format
			if (cleanText.includes('%')) {
				return decodeURIComponent(cleanText);
			}
			
			// Return text as is if no decoding needed
			return cleanText;
		} catch (error) {
			console.warn('Error decoding text:', error);
			// Try alternative approach for Unicode sequences
			try {
				return cleanText.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
					return String.fromCharCode(parseInt(hex, 16));
				});
			} catch (fallbackError) {
				console.warn('Fallback decoding error:', fallbackError);
				return cleanText; // Return original text in case of error
			}
		}
	}

	/**
	 * Normaliza quebras de linha para o formato padrão do sistema
	 * 
	 * @param {string} text - Texto com quebras de linha
	 * @returns {string} Texto com quebras de linha normalizadas
	 */
	static normalizeLineBreaks(text) {
		if (!text) return '';
		return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	}

	/**
	 * Remove espaços em branco excessivos
	 * 
	 * @param {string} text - Texto para limpar
	 * @returns {string} Texto sem espaços excessivos
	 */
	static cleanWhitespace(text) {
		if (!text) return '';
		return text.replace(/\s+/g, ' ').trim();
	}

	/**
	 * Escapa caracteres HTML especiais
	 * 
	 * @param {string} text - Texto para escapar
	 * @returns {string} Texto com caracteres HTML escapados
	 */
	static escapeHtml(text) {
		if (!text) return '';
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, (m) => map[m]);
	}

	/**
	 * Remove tags HTML de um texto
	 * 
	 * @param {string} text - Texto com HTML
	 * @returns {string} Texto sem tags HTML
	 */
	static stripHtml(text) {
		if (!text) return '';
		return text.replace(/<[^>]*>/g, '');
	}

	/**
	 * Trunca texto mantendo palavras inteiras
	 * 
	 * @param {string} text - Texto para truncar
	 * @param {number} maxLength - Comprimento máximo
	 * @param {string} suffix - Sufixo para texto truncado (padrão: '...')
	 * @returns {string} Texto truncado
	 */
	static truncate(text, maxLength, suffix = '...') {
		if (!text || text.length <= maxLength) return text;
		
		const truncated = text.substring(0, maxLength - suffix.length);
		const lastSpace = truncated.lastIndexOf(' ');
		
		return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + suffix;
	}

	/**
	 * Converte texto para formato slug (URL-friendly)
	 * 
	 * @param {string} text - Texto para converter
	 * @returns {string} Slug gerado
	 */
	static slugify(text) {
		if (!text) return '';
		
		return text
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '') // Remove acentos
			.replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
			.replace(/\s+/g, '-') // Substitui espaços por hífens
			.replace(/-+/g, '-') // Remove hífens duplicados
			.replace(/^-|-$/g, ''); // Remove hífens do início e fim
	}
}

// Export para uso em módulos ES6
export default TextHelper;

// Export para uso em módulos CommonJS
if (typeof module !== 'undefined' && module.exports) {
	module.exports = TextHelper;
}

// Export para uso no browser
if (typeof window !== 'undefined') {
	window.TextHelper = TextHelper;
}

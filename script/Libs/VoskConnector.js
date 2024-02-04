import EventEmitter from './EventEmitter.js'

export default class VoskConnector {

	constructor ( options ) {

		this.eventEmitter = new EventEmitter()

		this.started = false

		this.language = options.language
		this.mediaStream = null
		this.wsURL = options.wsURL
		this.sampleRate = 48000

		let script_path = import.meta.url

		let voskPrePath = script_path.replace( 'VoskConnector.js', '' ).split( '?' )
		this.voskPath = voskPrePath[0] + 'Vosk'

	}

	checkWebAssembly () {

		return false // web assembly version has a bug. this.audioClient.stop() makes speeck synthesis stop too, and with web assembly, don't call this.audioClient.stop() makes it listen the bot speaking

		// but vosk server keeping down... this issue: https://github.com/alphacep/vosk-api/issues/1127

		try {
			if ( typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function" ) {
				const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
				if ( module instanceof WebAssembly.Module ) {
					return new WebAssembly.Instance( module ) instanceof WebAssembly.Instance
				}
			}
		} catch (e) {
		}

		return false

	}

	async remoteVosk () {

		console.log('[✘] WebAssembly is not supported by your browser. Will try external server for speech recognition.')

		if ( this.audioWorklet == undefined ) {
			// this.audioWorklet = await import( /* @vite-ignore */ this.voskPath + '/Remote/VoiceClientWithAudioWorklet.js' )
			this.audioWorklet = await import( /* @vite-ignore */ this.voskPath + '/Remote/VoiceClientWithScriptProcessor.js' )
			this.audioClient = new this.audioWorklet.default( {wsURL: this.wsURL, sampleRate: this.sampleRate, language: this.language} )
		}

		this.audioClient.start()

		this.eventEmitter.trigger( 'start' )

	}

	async localVosk () {

		this.audioWorklet = await import( /* @vite-ignore */ this.voskPath + '/InBrowser/LocalInit.js' )
		this.audioClient = new this.audioWorklet.default( {language: this.language, sampleRate: this.sampleRate} )
		this.audioClient.start()

		this.eventEmitter.trigger( 'start' )

		console.log('[✔︎] Non-native, in-browser Speech Recognition is up.')

	}

	async start () {

		if ( this.started )
			return

		if ( this.checkWebAssembly() ) {
			await this.localVosk()
		} else {
			await this.remoteVosk()
		}

		this.audioClient.eventEmitter.on( 'result', (e)=>{
			if ( e.final && this.started )
				this.eventEmitter.trigger( 'result', [e] )
		})

		setTimeout( ()=>{ this.started = true }, 500 )

	}

	stop () {

		if ( !this.started )
			return

		this.started = false

		if ( this.mediaStream ) {
			this.mediaStream.getTracks().forEach(function(track) {
				track.stop();
			});
			this.audioClient.stop()
		}
		this.eventEmitter.trigger( 'stop' )

	}

}
import EventEmitter from './EventEmitter.js'

import EnvironmentDetection from '../Libs/EnvironmentDetection.js'

export default class SpeechRecognition {

	constructor ( options ) {

		this.speechRecognition = null
		this.eventEmitter = new EventEmitter()

		this.EnvironmentDetection = new EnvironmentDetection()

		this.language = options.language

		this.started = false

		if ( ! this.checkIfEnabled() ) {
			console.debug( 'The browser don\'t support speech recognition.' )
		}

	}

	checkIfEnabled () {

		if ( 'SpeechRecognition' in window ) {
			this.speechRecognition = new SpeechRecognition()
		} else if ( 'webkitSpeechRecognition' in window ) {
			this.speechRecognition = new webkitSpeechRecognition()
		} else {
			return false
		}

		return true

	}

	start () {

		if ( this.started )
			return

		this.started = true

		// if ( this.EnvironmentDetection.whatBrowser() == 'Safari' ) {
			// this.speechRecognition.continuous = true
		// } else {
			this.speechRecognition.continuous = true
		// }
		this.speechRecognition.lang = this.language
		this.speechRecognition.interimResults = false // true call results too much times and creates a queue, this makes speech synthesis and speech recognition to reload each other
		this.speechRecognition.maxAlternatives = 3

		this.speechRecognition.start()

		this.speechRecognition.onresult = (e) => {
			const ret = this.recognize( e.results )
			this.eventEmitter.trigger( 'result', [ret] )
		}

		// result received
		// this.speechRecognition.addEventListener('result', (e)=>{
		// 	const ret = this.recognize( e.results )
		// 	this.eventEmitter.trigger( 'result', [ret] )
		// 	// this.eventEmitter.trigger( 'result', e )
		// })
		// user starts the recognition service
		this.speechRecognition.addEventListener('start', (e)=>{
			this.started = true
			this.eventEmitter.trigger( 'start', e )
		})
		// recognition service was turned off
		this.speechRecognition.addEventListener('stop', (e)=>{
			this.started = false
			this.eventEmitter.trigger( 'stop', e )
		})
		// recognition service was paused temporarily
		this.speechRecognition.addEventListener('end', (e)=>{
			this.started = false
			this.eventEmitter.trigger( 'stop', e )
		})
		// recognition service listen a sound
		this.speechRecognition.addEventListener('soundstart', (e)=>{
			this.eventEmitter.trigger( 'soundstart', e )
		})
		// recognition service noticed the end of the sounds
		this.speechRecognition.addEventListener('soundend', (e)=>{
			this.eventEmitter.trigger( 'soundend', e )
		})
		// recognition service listen a speech
		this.speechRecognition.addEventListener('speechstart', (e)=>{
			this.eventEmitter.trigger( 'speechstart', e )
		})
		// recognition service noticed the end of the speech
		this.speechRecognition.addEventListener('speechend', (e)=>{
			this.started = false
			this.eventEmitter.trigger( 'speechend', e )
		})
		// error messages from the recognition service
		this.speechRecognition.addEventListener('error', (e)=>{
			console.log( e )
			this.started = false
			this.eventEmitter.trigger( 'error', [e] )
		})

	}

	stop () {

		this.speechRecognition.stop()
		this.started = false

	}

	recognize ( results ) {

		if ( ! results )
			return

		let ret = ''
		let prob = 0
		var alternative = []
		let i = results.length - 1

		prob = 0
		alternative = ''
		for ( var j in results[i] ) {
			if ( results[i][j].transcript != undefined ) {
				if ( results[i][j].confidence >= prob ) {
					alternative = results[i][j].transcript
					prob = results[i][j].confidence
				}
			}
		}
		ret += alternative

		return { result: ret, final:  results[i].isFinal }

	}


}
import EventEmitter from '../../EventEmitter.js'


export default class VoiceClientWithAudioWorklet {

    constructor ( options ) {

        this.voskPromisse = this.getVosk()

        this.eventEmitter = new EventEmitter()

        this.language = options.language

        let script_path = import.meta.url
        this.voskLibDir = script_path.replace( 'InBrowser/LocalInit.js', '' )

        this.modelsPath = this.voskLibDir + 'Models/'
        this.models = {
            'pt-br': 'vosk-model-small-pt-0.3.tar.gz'
        }

        this.channel = new MessageChannel();
        this.sampleRate = options.sampleRate;

        this.model = null

    }

    async getVosk () {

        this.voskModule = await import( './Vosk.js' )
        this.vosk = Vosk

    }

    async start () {

        await this.voskPromisse

        if ( this.model === null ) {
            let model_path = this.modelsPath + this.models[ this.language.toLowerCase() ]
            this.model = await this.vosk.createModel( model_path )
            this.model.registerPort( this.channel.port1 )
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
                sampleRate: this.sampleRate
            },
            video: false,
        })

        this.audioContext = new AudioContext({sampleRate: this.sampleRate})
        this.source = this.audioContext.createMediaStreamSource(this.mediaStream)

        this.recognizer = new this.model.KaldiRecognizer( this.sampleRate )
        // this.recognizer.setWords( true )
        await this.audioContext.audioWorklet.addModule(this.voskLibDir + '/InBrowser/recognizer-processor.js')
        this.recognizerProcessor = new AudioWorkletNode(this.audioContext, 'recognizer-processor', { channelCount: 1, numberOfInputs: 1, numberOfOutputs: 1 })
        this.recognizerProcessor.port.postMessage({action: 'init', recognizerId: this.recognizer.id}, [ this.channel.port2 ])
        this.recognizerProcessor.connect(this.audioContext.destination)

        this.source.connect(this.recognizerProcessor)

        this.recognizer.on( 'result', ( message ) => {
            if ( message.result.text != undefined && message.result.text.length > 0 ) {
                let ret = [{ result: message.result.text, final: true }]
                this.eventEmitter.trigger( 'result', ret )
            }
        })
        this.recognizer.on( 'partialresult', ( message ) => {
            if ( message.result.partial != undefined && message.result.partial.length > 0 ) {
                let ret = [{ result: message.result.partial, final: false }]
                this.eventEmitter.trigger( 'result', ret )
            }
        })

    }

    stop () {

        this.recognizerProcessor.port.close()
        this.source.disconnect( this.recognizerProcessor )
        this.audioContext.close()

        if (this.mediaStream.active) {
            this.mediaStream.getTracks()[0].stop()
        }

        this.recognizerProcessor = null
        this.source = null
        this.audioContext = null
        this.mediaStream = null

        console.log('Connection cancelled')

    }

}


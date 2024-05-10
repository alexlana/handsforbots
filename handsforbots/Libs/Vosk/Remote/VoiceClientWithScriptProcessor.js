import EventEmitter from '../../EventEmitter.js'

import Resampler from '../Util/Resampler.js'

// 'ws://localhost:2700'

export default class VoiceClientWithScriptProcessor {

    constructor ( options ) {

        this.context = null
        this.source = null
        this.processor = null
        this.webSocket = null
        this.bufferSize = 8192
        this.sampleRate = options.sampleRate
        this.desiredSampleRate = 8000
        this.wsURL = options.wsURL
        this.language = options.language
        this.initComplete = false

        this.eventEmitter = new EventEmitter()

        let script_path = import.meta.url
        this.parentDir = script_path.replace( 'VoiceClientWithScriptProcessor.js', '' )

        this.resampler = new Resampler( this.sampleRate, this.desiredSampleRate, 1, this.bufferSize )

    }

    async start () {

        let sampleRate = this.sampleRate

        // await this.resamplerScript.then((scr)=>{
        //     this.resampler = scr.default
        // })

        this.initWS()
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
                sampleRate
            },
            video: false
        })

        this.handleSuccess()
        this.initComplete = true

    }

    stop () {

        if (this.initComplete === true) {

            this.webSocket.send('{"eof" : 1}');
            this.webSocket.close();

            this.source.disconnect(this.processor);
            this.processor.disconnect(this.context.destination);
            if (this.mediaStream.active) {
                this.mediaStream.getTracks()[0].stop();
            }
            this.initComplete = false;

        }

    }

    initWS () {
        this.webSocket = new WebSocket(this.wsURL)
        this.webSocket.binaryType = "arraybuffer"

        this.webSocket.onopen = (event) => {
            console.log('New WS connection established.')
        }

        this.webSocket.onerror = (event) => {
            console.error(event.data)
        }

        this.webSocket.onmessage = (event) => {

            if (event.data) {

                let parsed = JSON.parse(event.data)

                if (parsed.result != undefined) {
                    // console.log( parsed )
                }
                if (parsed.partial != undefined) {
                    if ( parsed.partial != undefined && parsed.partial.length > 0 )
                        this.eventEmitter.trigger( 'result', [{ result: parsed.partial, final: false }] )
                }
                if (parsed.text != undefined) {
                    if ( parsed.text != undefined && parsed.text.length > 0 )
                        this.eventEmitter.trigger( 'result', [{ result: parsed.text, final: true }] )
                }

            }

        }

    }

    async handleSuccess () {

        this.context = new AudioContext({sampleRate: this.sampleRate})
        this.source = this.context.createMediaStreamSource(this.mediaStream)
        this.processor = this.context.createScriptProcessor(this.bufferSize, 1, 1)

        // const resampler = new this.resampler( this.sampleRate, this.desiredSampleRate, 1, this.bufferSize )

        this.source.connect(this.processor)
        this.processor.connect(this.context.destination)

        this.processor.onaudioprocess = (event) => {
            const outBuf = this.resampler.resample(event.inputBuffer.getChannelData(0));
            this.sendAudio( outBuf )
        }

    }

    sendAudio( outBuf ) {
        if (this.webSocket.readyState === WebSocket.OPEN) {
            // convert to 16-bit payload
            const inputData = outBuf || new Float32Array(this.bufferSize)
            const targetBuffer = new Int16Array(inputData.length)
            for (let index = inputData.length; index > 0; index--) {
                targetBuffer[index] = 32767 * Math.min(1, inputData[index])
            }
            this.webSocket.send(targetBuffer.buffer)
        }
    }


}



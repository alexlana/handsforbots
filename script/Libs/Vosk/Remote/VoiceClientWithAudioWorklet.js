/**
 * Can't get it to work with this module. There is something about sampleRate.
 * Found a way to solve it at "VoiceClientWithScriptProcessor.js" so I abandoned
 * this script, but don't want to delete to revisit in the future.
 */


import EventEmitter from '../../EventEmitter.js'

// 'ws://localhost:2700'

export default class VoiceClientWithAudioWorklet {

    constructor ( options ) {

        this.context = null
        this.source = null
        this.processor = null
        this.webSocket = null
        this.sampleRate = options.sampleRate
        this.desiredSampleRate = 16000
        this.bufferSize = 8192
        this.wsURL = options.wsURL
        this.initComplete = false
        this.mediaStream = null

        this.eventEmitter = new EventEmitter()

        let script_path = import.meta.url
        this.parentDir = script_path.replace( 'VoiceClientWithAudioWorklet.js', '' )

    }

    async start () {

        if ( this.initComplete )
            return

        let sampleRate = this.sampleRate

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

        if ( this.initComplete === true ) {

            this.webSocket.send( '{"eof" : 1}' )
            this.webSocket.close()

            this.processor.port.close()
            this.source.disconnect( this.processor )
            this.context.close()

            if (this.mediaStream.active) {
                this.mediaStream.getTracks()[0].stop()
            }
            this.initComplete = false

            console.log('Connection cancelled')

        }

    }

    initWS () {
        this.webSocket = new WebSocket( this.wsURL )
        this.webSocket.binaryType = "arraybuffer"

        this.webSocket.onopen = (event) => {
            console.log('New connection established')
        }

        this.webSocket.onerror = (event) => {
            console.error(event.data)
        }

        this.webSocket.onmessage = (event) => {
console.log(event)
            if (event.data) {
                let parsed = JSON.parse(event.data)

                if (parsed.partial != undefined) {
                    if ( parsed.partial != undefined && parsed.partial.length > 0 )
                        this.eventEmitter.trigger( 'result', [{ result: parsed.partial, final: false }] )
                }
                if (parsed.text != undefined) {
                    if ( parsed.text != undefined && parsed.text.length > 0 )
                        this.eventEmitter.trigger( 'result', [{ result: parsed.text, final: true }] )
                }
// console.log(parsed)
// if ( parsed.partial != undefined && parsed.partial.length > 0 ) {
//     console.log('partial:')
//     console.log(parsed.partial)
// }
// if ( parsed.text != undefined && parsed.text.length > 0 ) {
//     console.log('text:')
//     console.log(parsed.text)
// }
                // if (parsed.result) console.log(parsed.result)
                // if (parsed.text) inputArea.innerText = parsed.text
            }
        }

    }

    async handleSuccess () {

        // this.context = new AudioContext({sampleRate: this.sampleRate})
        this.context = new AudioContext({sampleRate: this.sampleRate})

        await this.context.audioWorklet.addModule( this.parentDir + 'data-conversion-processor.js' )

        this.processor = new AudioWorkletNode(this.context, 'data-conversion-processor', {
            channelCount: 1,
            numberOfInputs: 1,
            numberOfOutputs: 1
        })

        let constraints = {audio: true}
        // const stream = await navigator.mediaDevices.getUserMedia(constraints)
        const stream = this.mediaStream

        this.source = this.context.createMediaStreamSource(stream)

        this.source.connect(this.processor)
        this.processor.connect(this.context.destination)

        this.processor.port.onmessage = event => {
            // this.webSocket.send( this.resampler.resampler( event.data ) )
            this.webSocket.send( event.data )
        }
        this.processor.port.start()

    }

}


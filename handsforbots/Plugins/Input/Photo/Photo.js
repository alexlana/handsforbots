


export default class Photo {

    constructor ( bot ) {
        this.bot = bot
        this.video = null

        this.language = {
            'en-us': {
                'take-a-photo': 'Take a photo',
            },
            'pt-br': {
                'take-a-photo': 'Tire uma foto',
            },
            'pt': {
                'take-a-photo': 'Tirar uma fotografia',
            },
        }

        this.bot.eventEmitter.on( 'photo.receiver', ( response ) => {
            this.receiver( response )
        })

        this.start_stream()

        console.log( '[✔︎] Bot\'s photo input connected.' )

    }

    input ( payload ) {

        this.bot.eventEmitter.trigger( 'core.send_to_backend', [{
            'plugin': 'Photo', 
            'payload': payload, 
            'trigger': 'photo.receiver'
        }])

    }

    receiver ( response ) {

        this.bot.eventEmitter.trigger( 'core.spread_output', [ response ] )
    }

    ui ( options ) {

        const video_wrapper = document.createElement( 'SECTION' )
        video_wrapper.setAttribute( 'id', 'video_wrapper' )
        video_wrapper.setAttribute( 'autoplay', 'autoplay' )

        const video_output = document.createElement( 'VIDEO' )
        video_output.setAttribute( 'id', 'video_output' )

        video_wrapper.append( video_output )
        document.querySelector( 'body' ).append( video_wrapper )

        const photo_button = document.createElement( 'BUTTON' )
        photo_button.setAttribute( 'id', 'take_a_photo' )
        photo_button.innerText = this.language[ this.bot.current_language ][ 'take-a-photo' ]
        document.querySelector( 'body' ).append( photo_button )

        const style_tag = document.createElement( 'STYLE' )
        const css = `
        #video_wrapper {
            overflow: hidden;
            position: fixed;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            overflow: hidden;
            transform: translate( -50%, -50% );
        }
        #video_output {
            display: block;
            margin: 0;
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            object-fit: cover;
        }
        #take_a_photo {
            position: relative;
            z-index: 2;
        }
        `
        style_tag.innerHTML = css
        document.querySelector( 'head' ).append( style_tag )

        this.video = video_output
        this.photo_button = photo_button

        this.bot.eventEmitter.trigger( 'core.ui_loaded' )

        console.log( '[✔︎] Photo UI added.' )

    }

    async start_stream () {

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        this.video.srcObject = stream
        this.video.play()

        this.photo_button.addEventListener( 'click', async ()=>{

            const videoTrack = stream.getVideoTracks()[0]
            const photoBlob = await this.getBlobFromMediaStream( stream )

            // Converte a imagem para base64
            const reader = new FileReader()
            reader.readAsDataURL( photoBlob )
            reader.onloadend = function () {

                const base64Image = reader.result

                // Envia a imagem ao servidor
                fetch( '/upload', {
                    method: 'POST',
                    body: JSON.stringify({ image: base64Image }),
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                .then(response => {
                    if (response.ok) {
                        console.log( 'Imagem enviada com sucesso!' )
                    } else {
                        console.error( 'Erro ao enviar a imagem.' )
                    }
                })
                .catch(error => {
                    console.error( 'Erro na requisição:', error )
                })

            }

        })

    }

    async getBlobFromMediaStream( stream ) {

        if ( 'ImageCapture' in window ) {

            const videoTrack = stream.getVideoTracks()[0]
            const imageCapture = new ImageCapture( videoTrack )
            return imageCapture.takePhoto()

        } else {

            const canvas = document.createElement( 'canvas' )
            const context = canvas.getContext( '2d' )

            this.video.srcObject = stream

            return new Promise((resolve, reject) => {

                this.video.addEventListener('loadeddata', async () => {

                    const { videoWidth, videoHeight } = this.video
                    canvas.width = videoWidth
                    canvas.height = videoHeight

                    try {

                        await this.video.play()
                        context.drawImage( this.video, 0, 0, videoWidth, videoHeight )
                        canvas.toBlob( resolve, 'image/png' )

                    } catch ( error ) {

                        reject( error )

                    }
                })

            })

        }

    }

}


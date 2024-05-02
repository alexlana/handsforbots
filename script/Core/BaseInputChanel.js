class BaseInputChannel {

    constructor ( bot, name, options ) {

		this.bot = bot
		this.language = {}

		this.register()

    }

    ui ( options ) {
    }

    input ( payload, title ) {
    }

}

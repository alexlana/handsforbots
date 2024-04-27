class BaseInputChannel {

    constructor ( name, options ) {

		this.name = ''
		this.bot = new Bot()
		this.language = {}

		this.register()

    }

    ui ( options ) {
    }

    input ( payload, title ) {
    }

	register () {

		this.bot.registerInput( this )

	}

}

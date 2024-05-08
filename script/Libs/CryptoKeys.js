import Cryptography from "./Cryptography";


export default class CryptoKeys {

	constructor ( index, storage, expire_time ) {

		this.index = index
		this.index_sec = index + '_sec'
		this.storage = storage
		this.expire_time = expire_time

		this.crypto = new Cryptography( 'cryptoDB', 'key' )

		this.bot_w = Date.now() + '-' + Math.random()
		this.bot_ws = {}
		this.bot_ws[ this.bot_w ] = true

	}

	async generateKey () {

		const key = await window.crypto.subtle.generateKey(
			{ name: 'AES-GCM', length: 256 },
			true,
			[ 'encrypt', 'decrypt' ]
		)
		await this.saveKey( key )

		return key

	}

	async generateSecondKey () {

		const key = await window.crypto.subtle.generateKey(
			{ name: 'AES-GCM', length: 256 },
			true,
			[ 'encrypt', 'decrypt' ]
		)

		return key

	}

	async destroyKey () {

		this.storage.removeItem( this.index )

	}

	async saveKey ( key ) {

		let idx = this.index

		const exportedKey = await window.crypto.subtle.exportKey( 'jwk', key )
		let keyString = JSON.stringify( exportedKey )

		// add a litle more security
		// encrypt the main key
		const skey = await this.generateSecondKey()
		const exportedSKey = await window.crypto.subtle.exportKey( 'jwk', skey )
		this.setCookie( '__rand', JSON.stringify( exportedSKey ), this.expire_time )

		keyString = await this.crypto.encryptData( keyString, skey )

		this.storage.setItem( idx, keyString )

	}

	async getKey () {

		let skey = this.getCookie( '__rand' )
		if ( skey != undefined ) {
			this.setCookie( '__rand', skey, this.expire_time )
			skey = JSON.parse( skey )
			let importedSKey = await window.crypto.subtle.importKey(
				"jwk",
				skey,
				{ name: "AES-GCM" },
				true,
				["encrypt", "decrypt"]
			)
			.then( ( importedSKey )=>{
				this.importedSKey = importedSKey
			})
			.catch( err => reject( err ) )
		}


		return new Promise( async ( resolve, reject ) => {

			let keyString = this.storage.getItem( this.index )

			if ( keyString ) {

				keyString = await this.crypto.decryptData( keyString, this.importedSKey )

				const exportedKey = JSON.parse( keyString )
				window.crypto.subtle.importKey(
					"jwk",
					exportedKey,
					{ name: "AES-GCM" },
					true,
					["encrypt", "decrypt"]
				)
				.then( importedKey => resolve( importedKey ) )
				.catch( err => reject( err ) )

			} else {

				reject( new Error( 'Key not found in storage.' ) )

			}

		})

	}

	setCookie ( cName, cValue, min ) {

		let date = new Date()
		date.setTime( date.getTime() + (min * 60 * 1000) )
		const expires = "expires=" + date.toUTCString()
		document.cookie = cName + "=" + encodeURIComponent( cValue ) + "; " + expires + "; path=/"

	}

	getCookie ( cName ) {

		const name = cName + "="
		const cDecoded = decodeURIComponent( document.cookie );
		const cArr = cDecoded .split('; ')
		let res
		cArr.forEach(val => {
			if (val.indexOf(name) === 0) res = val.substring(name.length)
		})

		return res

	}

	deleteCookie( name ) {
alert(name)
		if( this.getCookie( name ) ) {
			document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
		}
	}

}



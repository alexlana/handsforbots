export default class Cryptography {

  constructor(dbName = "cryptoDB", objectStoreName = "keys") {
    this.dbName = dbName;
    this.objectStoreName = objectStoreName;
  }

  async encryptData( data, key ) {

    const dataArray = new TextEncoder().encode( data );

    const iv = self.crypto.getRandomValues( new Uint8Array( 12 ) );

    const encryptedData = await self.crypto.subtle.encrypt( {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      dataArray
    );

    const encryptedDataBase64 = this.arrayBufferToBase64(encryptedData);
    const ret = { encryptedData: encryptedDataBase64, iv };

    return ret;

  }

  async decryptData(encryptedData, key) {

    const encryptedDataArrayBuffer = this.base64ToArrayBuffer(encryptedData.encryptedData);

    const ivArray = Object.values(encryptedData.iv);
    const iv = new Uint8Array(ivArray);

    const decryptedData = await self.crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: iv,
      },
      key, 
      encryptedDataArrayBuffer
    );

    const decryptedDataString = new TextDecoder().decode(decryptedData);

    return decryptedDataString;

  }


  arrayBufferToBase64 ( buffer ) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return self.btoa(binary);
  }


  base64ToArrayBuffer(base64) {
    const binaryString = self.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }


}


import Cryptography from "./Cryptography.js";

const crypto = new Cryptography( "cryptoDB", "key" );

onmessage = async (event) => {
  const { data, action, key } = event.data;

  if (action === "encrypt") {
    const encryptedData = await crypto.encryptData(data, key);
    postMessage({ result: encryptedData });
  } else if (action === "decrypt") {
    try {
      const decryptedData = await crypto.decryptData(data, key);
      postMessage({ result: decryptedData });
    } catch (err) {
      console.log(err)
    }
  }
};
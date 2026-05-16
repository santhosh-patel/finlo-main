import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'pem' });
const privateKeyBase64 = privateKey.export({ type: 'pkcs8', format: 'pem' });

console.log('Public Key (PEM):\n', publicKeyBase64);
console.log('Private Key (PEM):\n', privateKeyBase64);

// VAPID keys are the raw bytes of the public key (65 bytes for uncompressed)
// and the raw bytes of the private key (32 bytes).

// Extract raw bytes from the keys
const pubKeyBuffer = publicKey.export({ type: 'spki', format: 'der' });
// The DER for an EC key contains a lot of metadata. We just need the raw public key bytes.
// For P-256, it's the last 65 bytes of the SPKI DER.
const rawPubKey = pubKeyBuffer.slice(-65);
const vapidPublicKey = rawPubKey.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const privKeyBuffer = privateKey.export({ type: 'pkcs8', format: 'der' });
// For P-256, the raw private key is usually at a specific offset in PKCS#8 DER.
// It's easier to use a library, but let's try to find it.
// Actually, crypto.subtle or similar might be better.
console.log('VAPID Public Key:', vapidPublicKey);

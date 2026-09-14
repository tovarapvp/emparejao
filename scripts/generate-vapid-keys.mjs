const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

if (!privateJwk.d) throw new Error("No se pudo exportar la clave privada VAPID.");

console.log(`VAPID_PUBLIC_KEY="${base64Url(publicKey)}"`);
console.log(`VAPID_PRIVATE_KEY="${privateJwk.d}"`);
console.log('VAPID_SUBJECT="mailto:tu-correo@example.com"');

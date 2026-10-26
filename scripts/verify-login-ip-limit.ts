// Verifica el límite de login por IP (src/lib/rateLimit.ts): npm run verify:login-ip-limit
import assert from "node:assert/strict";
import { clearAttempts, clientIp, isLoginBlocked, LOGIN_IP_MAX, LOGIN_MAX, loginKey, recordLoginFailure } from "../src/lib/rateLimit";

// La IP sale del primer valor que pone Caddy.
assert.equal(clientIp(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" })), "200.1.2.3");
assert.equal(clientIp(new Headers({ "x-real-ip": "200.9.9.9" })), "200.9.9.9");
assert.equal(clientIp(new Headers()), "unknown");

// Por cuenta: LOGIN_MAX fallos bloquean esa cuenta, no otras desde otra IP.
for (let i = 0; i < LOGIN_MAX; i++) recordLoginFailure("ana", "1.1.1.1");
assert.equal(isLoginBlocked("ana", "9.9.9.9"), true);
assert.equal(isLoginBlocked("otra", "9.9.9.9"), false);

// Por IP: muchas cuentas distintas desde la misma IP terminan bloqueando esa IP para todas.
for (let i = 0; i < LOGIN_IP_MAX; i++) recordLoginFailure(`usuario${i}`, "2.2.2.2");
assert.equal(isLoginBlocked("nueva", "2.2.2.2"), true);
assert.equal(isLoginBlocked("nueva", "3.3.3.3"), false);

// Un login correcto limpia la cuenta pero no la IP.
clearAttempts(loginKey("usuario0"));
assert.equal(isLoginBlocked("usuario0", "2.2.2.2"), true);

console.log("OK límite de login por IP");

import crypto from "crypto";
import { promisify } from "util";

/*
 * Password hashing with Node's built-in scrypt and a per-user random salt.
 * Stored format: "scrypt$<saltHex>$<hashHex>".
 *
 * Anything stored WITHOUT the "scrypt$" prefix is a legacy plaintext password
 * from before hashing existed. verifyPassword() still accepts it (compared in
 * constant time) and reports needsRehash so the caller can replace it with a
 * hash right after a successful login.
 */

const scrypt = promisify(crypto.scrypt);
const PREFIX = "scrypt$";
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// Used so an unknown user costs the same time as a wrong password.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES);

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isHashedPassword(stored) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await scrypt(password, salt, KEY_LENGTH);

  return `${PREFIX}${salt.toString("hex")}$${hash.toString("hex")}`;
}

/*
 * Resolves { ok, needsRehash }. `stored` may be null/undefined (no such user):
 * that still does a scrypt run and returns ok: false.
 */
export async function verifyPassword(stored, password) {
  if (typeof password !== "string") {
    return { ok: false, needsRehash: false };
  }

  if (typeof stored !== "string") {
    await scrypt(password, DUMMY_SALT, KEY_LENGTH);
    return { ok: false, needsRehash: false };
  }

  if (!isHashedPassword(stored)) {
    // Legacy plaintext: hash both sides so the comparison is constant-time
    // and length-independent.
    const a = crypto.createHash("sha256").update(stored).digest();
    const b = crypto.createHash("sha256").update(password).digest();

    return { ok: safeEqual(a, b), needsRehash: true };
  }

  const [, saltHex, hashHex] = stored.split("$");

  if (!saltHex || !hashHex) {
    return { ok: false, needsRehash: false };
  }

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);

  return { ok: expected.length > 0 && safeEqual(actual, expected), needsRehash: false };
}

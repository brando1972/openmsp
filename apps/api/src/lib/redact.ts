/**
 * Fields that must never leave the API in a response or broadcast. Device secrets
 * are agent credentials: anyone holding one can heartbeat, report results and
 * open the tunnel as that device. The enrollment response is the one place a
 * secret is sent, to the device it belongs to, and it bypasses this filter.
 */
const SECRET_KEYS = new Set(["deviceSecret"]);

/** JSON.stringify replacer that drops secret fields at any depth. */
export function redactSecrets(key: string, value: unknown): unknown {
  return SECRET_KEYS.has(key) ? undefined : value;
}

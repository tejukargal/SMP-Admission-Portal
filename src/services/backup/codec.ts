import { Timestamp, GeoPoint, Bytes, DocumentReference, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';

// JSON cannot hold Firestore's special types. Plain JSON.stringify turns a
// Timestamp into {seconds, nanoseconds} and restore would write that back as
// an ordinary map — silently breaking every date query. These tagged objects
// round-trip the real types.

type Tagged =
  | { __type: 'timestamp'; seconds: number; nanoseconds: number }
  | { __type: 'geopoint'; latitude: number; longitude: number }
  | { __type: 'bytes'; base64: string }
  | { __type: 'ref'; path: string };

export function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds } satisfies Tagged;
  }
  if (value instanceof GeoPoint) {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude } satisfies Tagged;
  }
  if (value instanceof Bytes) return { __type: 'bytes', base64: value.toBase64() } satisfies Tagged;
  if (value instanceof DocumentReference) return { __type: 'ref', path: value.path } satisfies Tagged;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeValue(v);
    return out;
  }
  return value;
}

export function decodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    switch (obj.__type) {
      case 'timestamp': return new Timestamp(Number(obj.seconds), Number(obj.nanoseconds));
      case 'geopoint':  return new GeoPoint(Number(obj.latitude), Number(obj.longitude));
      case 'bytes':     return Bytes.fromBase64String(String(obj.base64));
      case 'ref':       return doc(db, String(obj.path));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeValue(v);
    return out;
  }
  return value;
}

/** True for an encoded Timestamp — used by the Excel export to show dates. */
export function isTaggedTimestamp(v: unknown): v is { __type: 'timestamp'; seconds: number; nanoseconds: number } {
  return !!v && typeof v === 'object' && (v as { __type?: unknown }).__type === 'timestamp';
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

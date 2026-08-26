"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPlayStoreRelease = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const androidpublisher_1 = require("@googleapis/androidpublisher");
const REGION = 'asia-south1';
const PACKAGE_NAME = 'com.smpstudents.portal';
const playServiceAccountKey = (0, params_1.defineSecret)('PLAY_SERVICE_ACCOUNT_KEY');
function db() {
    return admin.firestore();
}
function playPublisherClient() {
    const key = JSON.parse(playServiceAccountKey.value());
    const jwt = new androidpublisher_1.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    return (0, androidpublisher_1.androidpublisher)({ version: 'v3', auth: jwt });
}
/** Returns the highest versionCode among fully-rolled-out ('completed')
 *  production releases, or null if it can't be determined (no releases yet,
 *  or the API call fails — never throws). */
async function getLiveProductionVersionCode() {
    var _a, _b, _c;
    const publisher = playPublisherClient();
    let editId = null;
    try {
        const edit = await publisher.edits.insert({ packageName: PACKAGE_NAME });
        editId = (_a = edit.data.id) !== null && _a !== void 0 ? _a : null;
        if (!editId)
            return null;
        const track = await publisher.edits.tracks.get({
            packageName: PACKAGE_NAME,
            editId,
            track: 'production',
        });
        const releases = (_b = track.data.releases) !== null && _b !== void 0 ? _b : [];
        let maxVersionCode = null;
        for (const release of releases) {
            if (release.status !== 'completed')
                continue;
            for (const vc of (_c = release.versionCodes) !== null && _c !== void 0 ? _c : []) {
                const n = Number(vc);
                if (!Number.isNaN(n) && (maxVersionCode === null || n > maxVersionCode)) {
                    maxVersionCode = n;
                }
            }
        }
        return maxVersionCode;
    }
    catch (err) {
        console.error('getLiveProductionVersionCode failed', err);
        return null;
    }
    finally {
        if (editId) {
            await publisher.edits.delete({ packageName: PACKAGE_NAME, editId }).catch((err) => {
                console.error('Failed to discard Play Store edit', err);
            });
        }
    }
}
// ── Poll the Play Store production track and auto-publish appConfig/version
//    once a pending release (registered manually via Settings → App Version
//    after uploading a build) is confirmed live ────────────────────────────
exports.checkPlayStoreRelease = (0, scheduler_1.onSchedule)({ schedule: 'every 6 hours', region: REGION, secrets: [playServiceAccountKey] }, async () => {
    const pendingSnap = await db().doc('appConfig/pendingRelease').get();
    if (!pendingSnap.exists)
        return;
    const pending = pendingSnap.data();
    const liveVersionCode = await getLiveProductionVersionCode();
    if (liveVersionCode === null || liveVersionCode !== pending.versionCode)
        return;
    await db().doc('appConfig/version').set({ latestVersion: pending.versionName, updateUrl: pending.updateUrl }, { merge: true });
    await db().doc('appConfig/pendingRelease').delete();
});
//# sourceMappingURL=playStoreVersionCheck.js.map
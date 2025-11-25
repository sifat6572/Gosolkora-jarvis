"use strict";

const { randomUserAgent, randomOrcaUA } = require('../../node_modules/neokex-fca/src/utils/user-agents');

class FingerprintRotationManager {
    constructor() {
        this.rotationInterval = null;
        this.ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
        this.lastRotation = Date.now();
        this.rotationHistory = [];
        this.MAX_HISTORY = 10;
        this.regions = ['PRN', 'PNB', 'HKG', 'SYD', 'VLL', 'LLA', 'SIN'];
        this.currentRegionIndex = 0;
    }

    getRandomLocale() {
        const locales = [
            "en_US", "en_GB", "vi_VN", "id_ID", "th_TH",
            "fr_FR", "de_DE", "es_ES", "pt_BR", "ja_JP",
            "ko_KR", "zh_CN", "zh_TW", "it_IT", "ru_RU"
        ];
        return locales[Math.floor(Math.random() * locales.length)];
    }

    getRandomTimezone() {
        const timezones = [
            "America/Los_Angeles", "America/New_York", "America/Chicago",
            "Europe/London", "Europe/Paris", "Europe/Berlin",
            "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore",
            "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Manila",
            "Australia/Sydney", "Pacific/Auckland"
        ];
        return timezones[Math.floor(Math.random() * timezones.length)];
    }

    generateDriftedFingerprint(currentOptions, persona = 'desktop') {
        const driftFactor = Math.random();

        if (driftFactor < 0.3) {
            if (persona === 'desktop') {
                const newFingerprint = randomUserAgent();
                return {
                    userAgent: newFingerprint.userAgent,
                    secChUa: newFingerprint.secChUa,
                    secChUaFullVersionList: newFingerprint.secChUaFullVersionList,
                    secChUaPlatform: newFingerprint.secChUaPlatform,
                    secChUaPlatformVersion: newFingerprint.secChUaPlatformVersion,
                    browser: newFingerprint.browser,
                    locale: this.getRandomLocale(),
                    timezone: this.getRandomTimezone(),
                    rotated: true
                };
            } else {
                const androidData = randomOrcaUA();
                return {
                    userAgent: androidData.userAgent,
                    androidVersion: androidData.androidVersion,
                    device: androidData.device,
                    buildId: androidData.buildId,
                    resolution: androidData.resolution,
                    fbav: androidData.fbav,
                    fbbv: androidData.fbbv,
                    locale: androidData.locale,
                    carrier: androidData.carrier,
                    timezone: this.getRandomTimezone(),
                    rotated: true
                };
            }
        }

        return {
            locale: this.getRandomLocale(),
            timezone: this.getRandomTimezone(),
            rotated: false
        };
    }

    getNextRegion() {
        const region = this.regions[this.currentRegionIndex];
        this.currentRegionIndex = (this.currentRegionIndex + 1) % this.regions.length;
        return region;
    }

    startAutoRotation(api, globalOptions, updateCallback) {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }

        const rotationDelay = this.ROTATION_INTERVAL_MS + (Math.random() * 3600000);

        this.rotationInterval = setInterval(async () => {
            try {
                const persona = globalOptions.cachedPersona || 'desktop';
                const drifted = this.generateDriftedFingerprint(globalOptions, persona);

                if (drifted.rotated) {
                    console.log("[FingerprintRotation] Performing full fingerprint rotation");

                    if (persona === 'desktop') {
                        globalOptions.cachedUserAgent = drifted.userAgent;
                        globalOptions.cachedSecChUa = drifted.secChUa;
                        globalOptions.cachedSecChUaFullVersionList = drifted.secChUaFullVersionList;
                        globalOptions.cachedSecChUaPlatform = drifted.secChUaPlatform;
                        globalOptions.cachedSecChUaPlatformVersion = drifted.secChUaPlatformVersion;
                        globalOptions.cachedBrowser = drifted.browser;
                    } else {
                        globalOptions.cachedAndroidUA = drifted.userAgent;
                        globalOptions.cachedAndroidVersion = drifted.androidVersion;
                        globalOptions.cachedAndroidDevice = drifted.device;
                        globalOptions.cachedAndroidBuildId = drifted.buildId;
                        globalOptions.cachedAndroidResolution = drifted.resolution;
                        globalOptions.cachedAndroidFbav = drifted.fbav;
                        globalOptions.cachedAndroidFbbv = drifted.fbbv;
                        globalOptions.cachedAndroidCarrier = drifted.carrier;
                    }
                } else {
                    console.log("[FingerprintRotation] Performing light fingerprint drift (locale/timezone)");
                }

                globalOptions.cachedLocale = drifted.locale;
                globalOptions.cachedTimezone = drifted.timezone;

                this.rotationHistory.push({
                    timestamp: Date.now(),
                    rotationType: drifted.rotated ? 'full' : 'light',
                    persona: persona
                });

                if (this.rotationHistory.length > this.MAX_HISTORY) {
                    this.rotationHistory.shift();
                }

                this.lastRotation = Date.now();

                if (updateCallback && typeof updateCallback === 'function') {
                    updateCallback(drifted);
                }

            } catch (error) {
                console.error("[FingerprintRotation] Error during rotation:", error.message);
            }
        }, rotationDelay);

        console.log(`[FingerprintRotation] Auto-rotation enabled (every ~${Math.round(rotationDelay / 3600000)}h with jitter)`);
    }

    stopAutoRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
            console.log("[FingerprintRotation] Auto-rotation disabled");
        }
    }

    getRotationHistory() {
        return this.rotationHistory;
    }

    needsImmediateRotation() {
        return (Date.now() - this.lastRotation) >= this.ROTATION_INTERVAL_MS;
    }
}

module.exports = { FingerprintRotationManager };

"use strict";

class EnhancedRateLimiter {
    constructor() {
        this.threadCooldowns = new Map();
        this.endpointCooldowns = new Map();
        this.requestHistory = new Map();
        this.behavioralMetrics = new Map();
        this.checkpointMode = false;
        this.ERROR_CACHE_TTL = 300000;
        this.activeRequests = 0;
        this.MAX_CONCURRENT_REQUESTS = 8;
        this.BURST_THRESHOLD = 5;
        this.BURST_WINDOW_MS = 10000;
        this.QUIET_HOURS = { start: 2, end: 6 };
    }

    getCurrentHour() {
        return new Date().getHours();
    }

    isQuietHours() {
        const hour = this.getCurrentHour();
        return hour >= this.QUIET_HOURS.start && hour < this.QUIET_HOURS.end;
    }

    getCircadianMultiplier() {
        const hour = this.getCurrentHour();
        
        if (hour >= 2 && hour < 6) return 3.0;
        if (hour >= 0 && hour < 2) return 2.0;
        if (hour >= 6 && hour < 9) return 1.2;
        if (hour >= 9 && hour < 18) return 1.0;
        if (hour >= 18 && hour < 22) return 1.1;
        return 1.5;
    }

    async getContextAwareDelay(context = {}) {
        const { threadID, messageType = 'text', hasAttachment = false, isReply = false } = context;
        
        let baseDelay = 200;
        
        if (hasAttachment) {
            baseDelay += Math.random() * 1500 + 500;
        }
        
        if (isReply) {
            baseDelay += Math.random() * 300;
        }
        
        const circadianMultiplier = this.getCircadianMultiplier();
        baseDelay *= circadianMultiplier;
        
        if (this.checkpointMode) {
            baseDelay *= 5;
        }
        
        if (threadID && this.detectBurst(threadID)) {
            baseDelay *= 2;
            console.log(`[EnhancedRateLimit] Burst detected in thread ${threadID}, applying 2x delay`);
        }
        
        const variance = baseDelay * 0.3;
        const finalDelay = baseDelay + (Math.random() * variance - variance / 2);
        
        return Math.max(200, Math.floor(finalDelay));
    }

    detectBurst(threadID) {
        const now = Date.now();
        const history = this.requestHistory.get(threadID) || [];
        
        const recentRequests = history.filter(time => (now - time) < this.BURST_WINDOW_MS);
        
        if (recentRequests.length >= this.BURST_THRESHOLD) {
            return true;
        }
        
        return false;
    }

    recordRequest(threadID) {
        const now = Date.now();
        const history = this.requestHistory.get(threadID) || [];
        history.push(now);
        
        const cleaned = history.filter(time => (now - time) < this.BURST_WINDOW_MS);
        this.requestHistory.set(threadID, cleaned);
    }

    trackBehavior(threadID, action, metadata = {}) {
        const metrics = this.behavioralMetrics.get(threadID) || {
            messageCount: 0,
            replyCount: 0,
            attachmentCount: 0,
            lastActivity: 0,
            avgResponseTime: 0,
            responseTimes: []
        };
        
        switch (action) {
            case 'message':
                metrics.messageCount++;
                break;
            case 'reply':
                metrics.replyCount++;
                if (metadata.responseTime) {
                    metrics.responseTimes.push(metadata.responseTime);
                    if (metrics.responseTimes.length > 10) {
                        metrics.responseTimes.shift();
                    }
                    metrics.avgResponseTime = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
                }
                break;
            case 'attachment':
                metrics.attachmentCount++;
                break;
        }
        
        metrics.lastActivity = Date.now();
        this.behavioralMetrics.set(threadID, metrics);
    }

    async addStochasticDelay(context = {}) {
        const delay = await this.getContextAwareDelay(context);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (context.threadID) {
            this.recordRequest(context.threadID);
        }
    }

    enterCheckpointMode(duration = 3600000) {
        this.checkpointMode = true;
        console.log(`[EnhancedRateLimit] Entering checkpoint-aware backoff mode for ${duration}ms`);
        
        setTimeout(() => {
            this.checkpointMode = false;
            console.log("[EnhancedRateLimit] Exiting checkpoint mode");
        }, duration);
    }

    async checkRateLimit(context = {}) {
        while (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.isQuietHours()) {
            console.log("[EnhancedRateLimit] Quiet hours detected, applying extra delay");
        }
        
        await this.addStochasticDelay(context);
        this.activeRequests++;
        
        setTimeout(() => {
            this.activeRequests = Math.max(0, this.activeRequests - 1);
        }, 1000);
    }

    getBehavioralMetrics(threadID) {
        return this.behavioralMetrics.get(threadID) || null;
    }

    resetMetrics(threadID) {
        this.behavioralMetrics.delete(threadID);
        this.requestHistory.delete(threadID);
    }

    cleanup() {
        const now = Date.now();
        
        for (const [threadID, history] of this.requestHistory.entries()) {
            const cleaned = history.filter(time => (now - time) < this.BURST_WINDOW_MS);
            if (cleaned.length === 0) {
                this.requestHistory.delete(threadID);
            } else {
                this.requestHistory.set(threadID, cleaned);
            }
        }
        
        for (const [threadID, metrics] of this.behavioralMetrics.entries()) {
            if ((now - metrics.lastActivity) > 3600000) {
                this.behavioralMetrics.delete(threadID);
            }
        }
    }
}

const globalEnhancedRateLimiter = new EnhancedRateLimiter();

setInterval(() => globalEnhancedRateLimiter.cleanup(), 60000);

module.exports = { EnhancedRateLimiter, globalEnhancedRateLimiter };

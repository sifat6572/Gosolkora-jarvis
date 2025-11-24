const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");

module.exports = {
	config: {
		name: "sing",
		version: "2.2",
		author: "NeoKEX",
		countDown: 5,
		role: 0,
		description: {
			vi: "Tải audio từ YouTube",
			en: "Download audio from YouTube"
		},
		category: "media",
		guide: {
			vi: "   {pn} <tên bài hát>: tải audio từ YouTube",
			en: "   {pn} <song name>: download audio from YouTube"
		}
	},

	langs: {
		vi: {
			error: "✗ Đã xảy ra lỗi: %1",
			noResult: "⭕ Không có kết quả tìm kiếm nào phù hợp với từ khóa %1",
			noAudio: "⭕ Rất tiếc, không thể tải audio từ video này"
		},
		en: {
			error: "✗ An error occurred: %1",
			noResult: "⭕ No search results match the keyword %1",
			noAudio: "⭕ Sorry, unable to download audio from this video"
		}
	},

	onStart: async function ({ args, message, event, api, getLang }) {
		console.log("[SING] ========== START COMMAND ==========");
		console.log("[SING] Args:", args);
		console.log("[SING] Query:", args.join(" "));

		if (!args.length) {
			console.log("[SING] Error: No arguments provided");
			return message.SyntaxError();
		}

		const query = args.join(" ");

		try {
			console.log("[SING] Setting reaction to ⏳");
			api.setMessageReaction("⏳", event.messageID, () => {}, true);

			// Step 1: Search for video using yt-search
			console.log("[SING] ===== STEP 1: yt-search =====");
			let videoUrl, videoTitle;

			if (query.match(/^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie|youtubeembedding)\.(com|be)\//)) {
				console.log("[SING] Direct YouTube URL detected");
				videoUrl = query;
				videoTitle = "Audio";
			} else {
				console.log("[SING] Searching for:", query);
				const searchResults = await search(query);
				console.log("[SING] Search results count:", searchResults?.videos?.length || 0);

				if (!searchResults || searchResults.videos.length === 0) {
					console.log("[SING] No search results found");
					api.setMessageReaction("❌", event.messageID, () => {}, true);
					return message.reply(getLang("noResult", query));
				}

				const video = searchResults.videos[0];
				videoUrl = video.url;
				videoTitle = video.title;
				console.log("[SING] First result - Title:", videoTitle);
				console.log("[SING] Video URL:", videoUrl);
			}

			// Step 2: Get download URL from btch-downloader
			console.log("[SING] ===== STEP 2: btch-downloader =====");
			console.log("[SING] Calling youtube() with URL:", videoUrl);
			const downloadData = await youtube(videoUrl);
			console.log("[SING] Response received");
			console.log("[SING] Response status:", downloadData?.status);
			console.log("[SING] Response keys:", Object.keys(downloadData || {}));
			console.log("[SING] mp3 type:", typeof downloadData?.mp3);
			console.log("[SING] mp3 value:", downloadData?.mp3);

			if (!downloadData || !downloadData.status) {
				console.log("[SING] Error: Invalid download data or status false");
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Extract audio URL
			console.log("[SING] ===== STEP 3: Extract Audio URL =====");
			let audioUrl = null;
			if (typeof downloadData.mp3 === "string") {
				console.log("[SING] mp3 is string");
				audioUrl = downloadData.mp3;
			} else if (Array.isArray(downloadData.mp3) && downloadData.mp3.length > 0) {
				console.log("[SING] mp3 is array with", downloadData.mp3.length, "items");
				const mp3 = downloadData.mp3[0];
				audioUrl = typeof mp3 === "string" ? mp3 : mp3.url;
				console.log("[SING] Extracted URL from array");
			}

			console.log("[SING] Raw audio URL:", audioUrl);

			if (!audioUrl) {
				console.log("[SING] Error: No audio URL extracted");
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Decode HTML entities in URL
			console.log("[SING] ===== STEP 4: Decode URL =====");
			const beforeDecode = audioUrl;
			audioUrl = audioUrl.replace(/&amp;/g, "&");
			console.log("[SING] Contains &amp;:", beforeDecode.includes("&amp;"));
			console.log("[SING] Decoded audio URL:", audioUrl.substring(0, 100) + "...");

			// Step 3: Stream the audio URL directly
			console.log("[SING] ===== STEP 5: Axios Stream =====");
			console.log("[SING] Starting axios request");
			const response = await axios({
				method: "GET",
				url: audioUrl,
				responseType: "stream",
				timeout: 60000
			});

			console.log("[SING] Axios response status:", response.status);
			console.log("[SING] Axios response headers:", response.headers);
			console.log("[SING] Sending to user...");

			message.reply({
				body: videoTitle,
				attachment: response.data
			}, (err) => {
				console.log("[SING] ===== SEND RESULT =====");
				if (err) {
					console.log("[SING] Error sending:", err.message);
					api.setMessageReaction("❌", event.messageID, () => {}, true);
				} else {
					console.log("[SING] Success! Audio sent");
					api.setMessageReaction("✅", event.messageID, () => {}, true);
				}
			});

		} catch (err) {
			console.log("[SING] ===== ERROR =====");
			console.log("[SING] Error message:", err.message);
			console.log("[SING] Error code:", err.code);
			console.log("[SING] Error status:", err.response?.status);
			console.log("[SING] Stack:", err.stack);
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

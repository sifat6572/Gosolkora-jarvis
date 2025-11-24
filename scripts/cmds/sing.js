const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");

module.exports = {
	config: {
		name: "sing",
		version: "2.4",
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

		if (!args.length) {
			return message.SyntaxError();
		}

		const query = args.join(" ");

		try {
			api.setMessageReaction("⏳", event.messageID, () => {}, true);

			// Step 1: Search for video using yt-search
			let videoUrl, videoTitle;

			if (query.match(/^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie|youtubeembedding)\.(com|be)\//)) {
				videoUrl = query;
				videoTitle = "Audio";
			} else {
				const searchResults = await search(query);
				if (!searchResults || searchResults.videos.length === 0) {
					api.setMessageReaction("❌", event.messageID, () => {}, true);
					return message.reply(getLang("noResult", query));
				}
				const video = searchResults.videos[0];
				videoUrl = video.url;
				videoTitle = video.title;
				console.log("[SING] Found video:", videoTitle);
			}

			// Step 2: Get download URL from btch-downloader
			console.log("[SING] Calling btch-downloader...");
			const downloadData = await youtube(videoUrl);
			
			console.log("[SING] Response type:", typeof downloadData);
			console.log("[SING] Response status:", downloadData.status);
			console.log("[SING] Response title:", downloadData.title);
			console.log("[SING] Response thumbnail:", downloadData.thumbnail);
			console.log("[SING] Response author:", downloadData.author);
			console.log("[SING] Response mp3:", downloadData.mp3);
			console.log("[SING] Response mp4:", downloadData.mp4);

			if (!downloadData || !downloadData.status) {
				console.log("[SING] Error: No valid response");
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Extract audio URL
			let audioUrl = downloadData.mp3;
			console.log("[SING] Audio URL type:", typeof audioUrl);
			console.log("[SING] Audio URL:", audioUrl);

			if (!audioUrl) {
				console.log("[SING] Error: No audio URL");
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Decode HTML entities in URL
			audioUrl = audioUrl.replace(/&amp;/g, "&");

			// Step 3: Stream the audio URL directly
			console.log("[SING] Streaming audio...");
			const response = await axios({
				method: "GET",
				url: audioUrl,
				responseType: "stream",
				timeout: 60000
			});

			console.log("[SING] Axios response status:", response.status);

			message.reply({
				body: videoTitle,
				attachment: response.data
			}, (err) => {
				if (err) {
					console.log("[SING] Error:", err.message);
					api.setMessageReaction("❌", event.messageID, () => {}, true);
				} else {
					console.log("[SING] Success!");
					api.setMessageReaction("✅", event.messageID, () => {}, true);
				}
			});

		} catch (err) {
			console.log("[SING] Error:", err.message);
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

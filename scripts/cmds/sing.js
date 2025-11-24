const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");

module.exports = {
	config: {
		name: "sing",
		version: "2.1",
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
			}

			// Step 2: Get download URL from btch-downloader
			const downloadData = await youtube(videoUrl);

			if (!downloadData || !downloadData.status) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Extract audio URL
			let audioUrl = null;
			if (typeof downloadData.mp3 === "string") {
				audioUrl = downloadData.mp3;
			} else if (Array.isArray(downloadData.mp3) && downloadData.mp3.length > 0) {
				const mp3 = downloadData.mp3[0];
				audioUrl = typeof mp3 === "string" ? mp3 : mp3.url;
			}

			if (!audioUrl) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Decode HTML entities in URL
			audioUrl = audioUrl.replace(/&amp;/g, "&");

			// Step 3: Stream the audio URL directly
			const response = await axios({
				method: "GET",
				url: audioUrl,
				responseType: "stream"
			});

			message.reply({
				body: videoTitle,
				attachment: response.data
			}, (err) => {
				if (err) {
					api.setMessageReaction("❌", event.messageID, () => {}, true);
				} else {
					api.setMessageReaction("✅", event.messageID, () => {}, true);
				}
			});

		} catch (err) {
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

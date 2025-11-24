const search = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");

module.exports = {
	config: {
		name: "sing",
		version: "3.0",
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

			// Step 2: Get audio stream using ytdl-core
			console.log("[SING] Getting stream from:", videoUrl);
			const stream = ytdl(videoUrl, {
				quality: "highestaudio",
				filter: "audioonly"
			});

			// Step 3: Stream directly
			message.reply({
				body: videoTitle,
				attachment: stream
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

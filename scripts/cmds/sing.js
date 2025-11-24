const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
	config: {
		name: "sing",
		version: "1.2",
		author: "NeoKEX",
		countDown: 5,
		role: 0,
		description: {
			vi: "Tải audio từ YouTube (sử dụng yt-search + btch-downloader)",
			en: "Download audio from YouTube (using yt-search + btch-downloader)"
		},
		category: "media",
		guide: {
			vi: "   {pn} <tên bài hát>: tải audio từ YouTube"
					+ "\n   Ví dụ:"
					+ "\n    {pn} Fallen Kingdom",
			en: "   {pn} <song name>: download audio from YouTube"
					+ "\n    Example:"
					+ "\n    {pn} Fallen Kingdom"
		}
	},

	langs: {
		vi: {
			searching: "🔍 Đang tìm kiếm: %1...",
			downloading: "⬇️ Đang tải xuống...",
			error: "✗ Đã xảy ra lỗi: %1",
			noResult: "⭕ Không có kết quả tìm kiếm nào phù hợp với từ khóa %1",
			noAudio: "⭕ Rất tiếc, không thể tải audio từ video này"
		},
		en: {
			searching: "🔍 Searching: %1...",
			downloading: "⬇️ Downloading...",
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
		const MAX_SIZE = 27262976; // ~26MB

		try {
			// Set loading reaction
			api.setMessageReaction("⏳", event.messageID, () => {}, true);

			// Step 1: Search for video using yt-search
			let videoUrl;
			let videoTitle;

			if (query.match(/^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie|youtubeembedding)\.(com|be)\//)) {
				// Input is a YouTube URL
				videoUrl = query;
				videoTitle = "Audio";
			} else {
				// Search for video using yt-search
				const searchResults = await search(query);

				if (!searchResults || searchResults.videos.length === 0) {
					api.setMessageReaction("❌", event.messageID, () => {}, true);
					return message.reply(getLang("noResult", query));
				}

				// Get first video result
				const video = searchResults.videos[0];
				videoUrl = video.url;
				videoTitle = video.title;
			}

			// Step 2: Download and get audio using btch-downloader
			const downloadData = await youtube(videoUrl);

			if (!downloadData || !downloadData.status) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Extract audio URL from btch-downloader response
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

			// Step 3: Download the audio file
			const response = await axios({
				method: "GET",
				url: audioUrl,
				responseType: "stream",
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				timeout: 30000
			});

			const contentLength = parseInt(response.headers["content-length"] || 0);
			if (contentLength > MAX_SIZE && contentLength > 0) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Save file temporarily
			const tmpDir = path.join(__dirname, "tmp");
			fs.ensureDirSync(tmpDir);
			const savePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
			const writeStream = fs.createWriteStream(savePath);

			response.data.pipe(writeStream);

			writeStream.on("finish", () => {
				message.reply({
					body: videoTitle,
					attachment: fs.createReadStream(savePath)
				}, (err) => {
					if (err) {
						api.setMessageReaction("❌", event.messageID, () => {}, true);
						return message.reply(getLang("error", err.message));
					}
					try {
						fs.unlinkSync(savePath);
					} catch (e) {
						// File already deleted
					}
					api.setMessageReaction("✅", event.messageID, () => {}, true);
				});
			});

			writeStream.on("error", (err) => {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("error", err.message));
			});

		} catch (err) {
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

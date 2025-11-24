const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
	config: {
		name: "sing",
		version: "1.5",
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
		const MAX_SIZE = 27262976; // ~26MB

		try {
			api.setMessageReaction("⏳", event.messageID, () => {}, true);

			// Step 1: Search for video using yt-search
			let videoUrl;
			let videoTitle;

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

			// Step 2: Get audio URL using btch-downloader
			let downloadData = null;

			try {
				downloadData = await youtube(videoUrl);
			} catch (err) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			if (!downloadData || !downloadData.status) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Extract audio URL from btch-downloader response
			let audioUrl = null;

			if (typeof downloadData.mp3 === "string" && downloadData.mp3.startsWith("http")) {
				audioUrl = downloadData.mp3;
			} else if (Array.isArray(downloadData.mp3) && downloadData.mp3.length > 0) {
				const mp3Item = downloadData.mp3[0];
				if (typeof mp3Item === "string") {
					audioUrl = mp3Item;
				} else if (mp3Item.url) {
					audioUrl = mp3Item.url;
				}
			} else if (typeof downloadData.url === "string") {
				audioUrl = downloadData.url;
			}

			if (!audioUrl) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Step 3: Download the audio file with proper headers
			const tmpDir = path.join(__dirname, "tmp");
			fs.ensureDirSync(tmpDir);
			const savePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);

			try {
				const response = await axios({
					method: "GET",
					url: audioUrl,
					responseType: "arraybuffer",
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
						'Accept': '*/*',
						'Referer': 'https://www.youtube.com/',
					},
					timeout: 60000,
					maxRedirects: 10
				});

				// Write buffer to file
				fs.writeFileSync(savePath, response.data);

				const fileSize = fs.statSync(savePath).size;
				if (fileSize > MAX_SIZE) {
					fs.unlinkSync(savePath);
					api.setMessageReaction("❌", event.messageID, () => {}, true);
					return message.reply(getLang("noAudio"));
				}

				// Send the file
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
						// Ignore
					}
					api.setMessageReaction("✅", event.messageID, () => {}, true);
				});

			} catch (err) {
				try {
					fs.unlinkSync(savePath);
				} catch (e) {
					// Ignore
				}
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("error", err.message));
			}

		} catch (err) {
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

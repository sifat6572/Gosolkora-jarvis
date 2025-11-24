const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
	config: {
		name: "sing",
		version: "1.3",
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
			// Set loading reaction
			api.setMessageReaction("⏳", event.messageID, () => {}, true);

			// Step 1: Search for video using yt-search
			let videoUrl;
			let videoTitle;
			let videoId;

			if (query.match(/^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie|youtubeembedding)\.(com|be)\//)) {
				// Input is a YouTube URL - extract video ID
				const idMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
				videoId = idMatch ? idMatch[1] : null;
				videoUrl = videoId ? `https://youtu.be/${videoId}` : query;
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
				videoId = video.videoId;
			}

			// Step 2: Download and get audio using btch-downloader with retry
			let downloadData = null;
			let retryCount = 0;
			const maxRetries = 3;

			while (retryCount < maxRetries && !downloadData) {
				try {
					// Try with short URL format (youtu.be)
					const urlToTry = videoId ? `https://youtu.be/${videoId}` : videoUrl;
					downloadData = await youtube(urlToTry);
					
					if (downloadData && downloadData.status) {
						break;
					}
					
					// If failed, wait before retry
					if (retryCount < maxRetries - 1) {
						await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
					}
					retryCount++;
				} catch (err) {
					if (retryCount < maxRetries - 1) {
						await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
					}
					retryCount++;
				}
			}

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

			// Step 3: Download the audio file with browser-like headers and retry
			let response = null;
			let downloadRetries = 0;
			const maxDownloadRetries = 2;

			while (downloadRetries < maxDownloadRetries && !response) {
				try {
					response = await axios({
						method: "GET",
						url: audioUrl,
						responseType: "stream",
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
							'Accept': '*/*',
							'Accept-Language': 'en-US,en;q=0.9',
							'Accept-Encoding': 'gzip, deflate, br',
							'Referer': 'https://www.youtube.com/',
							'Origin': 'https://www.youtube.com',
							'DNT': '1',
							'Connection': 'keep-alive',
							'Upgrade-Insecure-Requests': '1',
						},
						timeout: 30000,
						maxRedirects: 5,
						validateStatus: () => true
					});

					// Check for success
					if (response.status < 400) {
						break;
					}

					response = null;
					if (downloadRetries < maxDownloadRetries - 1) {
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
					downloadRetries++;
				} catch (err) {
					response = null;
					if (downloadRetries < maxDownloadRetries - 1) {
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
					downloadRetries++;
				}
			}

			if (!response || response.status >= 400) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("error", "Failed to download audio"));
			}

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

const search = require("yt-search");
const { youtube } = require("btch-downloader");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
	config: {
		name: "sing",
		version: "1.4",
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

			// Step 2: Get audio metadata using btch-downloader
			let downloadData = null;

			try {
				downloadData = await youtube(videoUrl);
			} catch (err) {
				console.log("btch-downloader error:", err.message);
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			if (!downloadData || !downloadData.status) {
				console.log("btch-downloader status false:", JSON.stringify(downloadData));
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			// Debug log to see actual response structure
			console.log("btch-downloader response keys:", Object.keys(downloadData));
			console.log("mp3 type:", typeof downloadData.mp3);
			console.log("mp3 value:", downloadData.mp3);

			// Try multiple ways to extract audio URL
			let audioUrl = null;

			// Try direct mp3 property
			if (typeof downloadData.mp3 === "string" && downloadData.mp3.startsWith("http")) {
				audioUrl = downloadData.mp3;
			}
			// Try mp3 array first element
			else if (Array.isArray(downloadData.mp3) && downloadData.mp3.length > 0) {
				const mp3Item = downloadData.mp3[0];
				if (typeof mp3Item === "string") {
					audioUrl = mp3Item;
				} else if (mp3Item.url) {
					audioUrl = mp3Item.url;
				}
			}
			// Try fallback url property
			else if (typeof downloadData.url === "string") {
				audioUrl = downloadData.url;
			}

			if (!audioUrl) {
				console.log("No audio URL found in response");
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("noAudio"));
			}

			console.log("Using audio URL:", audioUrl);

			// Step 3: Download the audio file
			let downloadAttempts = 0;
			let savedFile = null;

			while (downloadAttempts < 2 && !savedFile) {
				try {
					const response = await axios({
						method: "GET",
						url: audioUrl,
						responseType: "stream",
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
							'Accept': '*/*',
							'Accept-Language': 'en-US,en;q=0.9',
							'Referer': 'https://www.youtube.com/',
							'Origin': 'https://www.youtube.com',
						},
						timeout: 45000,
						maxRedirects: 10,
						validateStatus: () => true
					});

					if (response.status >= 400) {
						console.log(`Download attempt ${downloadAttempts + 1} failed with status: ${response.status}`);
						downloadAttempts++;
						if (downloadAttempts < 2) {
							await new Promise(resolve => setTimeout(resolve, 2000));
						}
						continue;
					}

					// Save the file
					const tmpDir = path.join(__dirname, "tmp");
					fs.ensureDirSync(tmpDir);
					const savePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);

					await new Promise((resolve, reject) => {
						const writeStream = fs.createWriteStream(savePath);
						response.data
							.pipe(writeStream)
							.on("finish", () => {
								console.log("File saved successfully to:", savePath);
								savedFile = savePath;
								resolve();
							})
							.on("error", reject);
					});

				} catch (err) {
					console.log(`Download attempt ${downloadAttempts + 1} error:`, err.message);
					downloadAttempts++;
					if (downloadAttempts < 2) {
						await new Promise(resolve => setTimeout(resolve, 2000));
					}
				}
			}

			if (!savedFile) {
				api.setMessageReaction("❌", event.messageID, () => {}, true);
				return message.reply(getLang("error", "Download failed after retries"));
			}

			// Send the file
			message.reply({
				body: videoTitle,
				attachment: fs.createReadStream(savedFile)
			}, (err) => {
				if (err) {
					api.setMessageReaction("❌", event.messageID, () => {}, true);
					return message.reply(getLang("error", err.message));
				}
				try {
					fs.unlinkSync(savedFile);
				} catch (e) {
					// Ignore delete errors
				}
				api.setMessageReaction("✅", event.messageID, () => {}, true);
			});

		} catch (err) {
			console.log("Sing command error:", err);
			api.setMessageReaction("❌", event.messageID, () => {}, true);
			return message.reply(getLang("error", err.message));
		}
	}
};

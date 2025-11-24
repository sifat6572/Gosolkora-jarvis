const { youtube } = require("btch-downloader");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
        config: {
                name: "sing",
                version: "1.1",
                author: "NeoKEX",
                countDown: 5,
                role: 0,
                description: {
                        vi: "Tải audio từ YouTube (tự động chọn kết quả đầu tiên)",
                        en: "Download audio from YouTube (automatically choose first result)"
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
                        noAudio: "⭕ Rất tiếc, không tìm thấy audio nào có dung lượng nhỏ hơn 26MB"
                },
                en: {
                        error: "✗ An error occurred: %1",
                        noResult: "⭕ No search results match the keyword %1",
                        noAudio: "⭕ Sorry, no audio was found with a size less than 26MB"
                }
        },

        onStart: async function ({ args, message, event, api, getLang }) {
                if (!args.length) {
                        return message.SyntaxError();
                }

                const query = args.join(" ").replace("?feature=share", "");
                const MAX_SIZE = 27262976; // ~26MB

                try {
                        // Set loading reaction
                        api.setMessageReaction("⏳", event.messageID, () => {}, true);

                        // Get video data from btch-downloader
                        const ytData = await youtube(query);

                        if (!ytData.status) {
                                api.setMessageReaction("❌", event.messageID, () => {}, true);
                                return message.reply(getLang("noResult", query));
                        }

                        // Check if mp3 array exists and has at least one option
                        if (!ytData.mp3 || !Array.isArray(ytData.mp3) || ytData.mp3.length === 0) {
                                api.setMessageReaction("❌", event.messageID, () => {}, true);
                                return message.reply(getLang("noAudio"));
                        }

                        // Get the first (highest quality) MP3 option
                        const mp3Data = ytData.mp3[0];
                        const audioUrl = mp3Data.url;
                        const title = ytData.title || "Audio";

                        if (!audioUrl) {
                                api.setMessageReaction("❌", event.messageID, () => {}, true);
                                return message.reply(getLang("noAudio"));
                        }

                        // Check file size from btch-downloader response
                        if (mp3Data.size) {
                                const sizeStr = mp3Data.size.toString();
                                let sizeInBytes = 0;

                                if (sizeStr.includes("MB")) {
                                        sizeInBytes = parseFloat(sizeStr) * 1024 * 1024;
                                } else if (sizeStr.includes("KB")) {
                                        sizeInBytes = parseFloat(sizeStr) * 1024;
                                } else {
                                        sizeInBytes = parseInt(sizeStr);
                                }

                                if (sizeInBytes > MAX_SIZE) {
                                        api.setMessageReaction("❌", event.messageID, () => {}, true);
                                        return message.reply(getLang("noAudio"));
                                }
                        }

                        // Download the audio
                        const response = await axios({
                                method: "GET",
                                url: audioUrl,
                                responseType: "stream",
                                headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                },
                                timeout: 30000
                        });

                        // Save file temporarily
                        const tmpDir = path.join(__dirname, "tmp");
                        fs.ensureDirSync(tmpDir);
                        const savePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
                        const writeStream = fs.createWriteStream(savePath);

                        response.data.pipe(writeStream);

                        writeStream.on("finish", () => {
                                message.reply({
                                        body: title,
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

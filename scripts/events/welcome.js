const { getTime, drive } = global.utils;

module.exports = {
        config: {
                name: "welcome",
                version: "1.0",
                author: "NeoKEX",
                category: "events"
        },

        langs: {
                vi: {
                        session1: "sáng",
                        session2: "trưa",
                        session3: "chiều",
                        session4: "tối",
                        defaultWelcomeMessage: "Chào mừng {userName} đến với nhóm {threadName}! 🎉"
                },
                en: {
                        session1: "morning",
                        session2: "noon",
                        session3: "afternoon",
                        session4: "evening",
                        defaultWelcomeMessage: "Welcome {userName} to {threadName}! 🎉"
                }
        },

        onStart: async ({ threadsData, message, event, api, usersData, getLang }) => {
                if (event.logMessageType == "log:subscribe")
                        return async function () {
                                const { threadID } = event;
                                const threadData = await threadsData.get(threadID);

                                if (!threadData.settings.sendWelcomeMessage)
                                        return;

                                const { addedParticipants } = event.logMessageData;

                                if (!addedParticipants || addedParticipants.length === 0)
                                        return;

                                const joinedUser = addedParticipants[0];
                                const joinedUserID = joinedUser.userFbId;

                                // Don't send welcome for bot itself
                                if (joinedUserID == api.getCurrentUserID())
                                        return;

                                const threadName = threadData.threadName;
                                const userName = await usersData.getName(joinedUserID);
                                const hours = getTime("HH");

                                // {userName}      : name of the user who joined
                                // {threadName}    : name of the group
                                // {boxName}       : name of the box (same as threadName)
                                // {memberCount}   : total members in group
                                // {time}          : current time
                                // {session}       : morning/noon/afternoon/evening

                                let { welcomeMessage = getLang("defaultWelcomeMessage") } = threadData.data;

                                const form = {
                                        mentions: welcomeMessage.match(/\{userNameTag\}/g) ? [{
                                                tag: userName,
                                                id: joinedUserID
                                        }] : null
                                };

                                welcomeMessage = welcomeMessage
                                        .replace(/\{userName\}|\{userNameTag\}/g, userName)
                                        .replace(/\{threadName\}|\{boxName\}/g, threadName)
                                        .replace(/\{memberCount\}/g, event.participantIDs.length)
                                        .replace(/\{time\}/g, hours)
                                        .replace(/\{session\}/g, 
                                                hours <= 10 ? getLang("session1") :
                                                hours <= 12 ? getLang("session2") :
                                                hours <= 18 ? getLang("session3") :
                                                getLang("session4")
                                        );

                                form.body = welcomeMessage;

                                if (welcomeMessage.includes("{userNameTag}")) {
                                        form.mentions = [{
                                                id: joinedUserID,
                                                tag: userName
                                        }];
                                }

                                if (threadData.data.welcomeAttachment) {
                                        const files = threadData.data.welcomeAttachment;
                                        const attachments = files.reduce((acc, file) => {
                                                acc.push(drive.getFile(file, "stream"));
                                                return acc;
                                        }, []);
                                        form.attachment = (await Promise.allSettled(attachments))
                                                .filter(({ status }) => status == "fulfilled")
                                                .map(({ value }) => value);
                                }

                                message.send(form);
                        };
        }
};
